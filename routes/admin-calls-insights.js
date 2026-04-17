/**
 * Admin API: call analytics + insights.
 * Mounted at /api/admin — paths here are /calls/insights.
 */
import { Router } from 'express';

/**
 * @param {{ query: (sql: string, params?: any[]) => Promise<{ rows?: any[] }> }} deps
 */
export function createAdminCallsInsightsRouter(deps) {
  const { query } = deps || {};
  const router = Router();

  router.get('/calls/insights', async (req, res) => {
    try {
      const { clientKey, days = 30 } = req.query;

      let q = `
      SELECT
        cl.*,
        cr.transcript,
        cr.recording_url,
        l.name as lead_name,
        c.display_name as client_name
      FROM calls cl
      LEFT JOIN call_recordings cr ON cl.call_id = cr.call_id
      LEFT JOIN leads l ON cl.lead_phone = l.phone
      LEFT JOIN tenants c ON cl.client_key = c.client_key
      WHERE cl.created_at >= NOW() - INTERVAL '${parseInt(days)} days'
    `;

      const params = [];
      if (clientKey) {
        q += ` AND cl.client_key = $1`;
        params.push(clientKey);
      }

      q += ` ORDER BY cl.created_at DESC`;

      const calls = await query(q, params);

      const insights = {
        totalCalls: calls.rows.length,
        totalDuration: calls.rows.reduce((sum, c) => sum + (c.duration || 0), 0),
        avgDuration:
          calls.rows.length > 0
            ? Math.round(calls.rows.reduce((sum, c) => sum + (c.duration || 0), 0) / calls.rows.length)
            : 0,
        outcomes: calls.rows.reduce((acc, c) => {
          acc[c.outcome] = (acc[c.outcome] || 0) + 1;
          return acc;
        }, {}),
        recordings: calls.rows.filter((c) => c.recording_url).length,
        transcripts: calls.rows.filter((c) => c.transcript).length
      };

      res.json({
        calls: calls.rows,
        insights
      });
    } catch (error) {
      console.error('Error getting call insights:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

