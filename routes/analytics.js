/**
 * Analytics API.
 * Mounted at /api/analytics.
 */
import { Router } from 'express';

export function createAnalyticsRouter() {
  const router = Router();

  // Lead scoring endpoint
  router.post('/score-leads', async (req, res) => {
    try {
      const { clientKey } = req.query;
      if (!clientKey) return res.status(400).json({ ok: false, error: 'clientKey required' });

      const { query } = await import('../db.js');
      const { calculateLeadScore } = await import('../lib/analytics-tracker.js');

      const leadsResult = await query(
        `
      SELECT l.*,
        (SELECT COUNT(*) FROM call_queue WHERE lead_phone = l.phone AND client_key = $1) as call_count,
        (SELECT COUNT(*) FROM call_queue WHERE lead_phone = l.phone AND client_key = $1 AND status = 'completed') as answered_count,
        (SELECT MAX(duration) FROM call_queue WHERE lead_phone = l.phone AND client_key = $1) as max_duration
      FROM leads l
      WHERE l.client_key = $1
    `,
        [clientKey]
      );

      const scoredLeads = leadsResult.rows.map((lead) => {
        const behavior = {
          callAnswered: lead.answered_count > 0,
          callCount: parseInt(lead.call_count || 0),
          callDuration: parseInt(lead.max_duration || 0),
          daysSinceContact: lead.last_contacted_at
            ? Math.floor(
                (Date.now() - new Date(lead.last_contacted_at).getTime()) / (1000 * 60 * 60 * 24)
              )
            : 365
        };

        const score = calculateLeadScore(lead, behavior);

        return {
          phone: lead.phone,
          name: lead.name,
          score,
          priority: score >= 80 ? 'high' : score >= 50 ? 'medium' : 'low',
          behavior
        };
      });

      scoredLeads.sort((a, b) => b.score - a.score);

      res.json({ ok: true, leads: scoredLeads });
    } catch (error) {
      console.error('[SCORE LEADS ERROR]', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  return router;
}

