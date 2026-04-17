/**
 * Admin API: ops utilities around call queue / outbound journey.
 * Mounted at /api/admin — paths here are /call-queue/* and /outbound-weekday-journey/*.
 */
import { Router } from 'express';

export function createAdminCallQueueOpsRouter() {
  const router = Router();

  // Dedupe pending outbound queue rows (same tenant + digit phone key); keeps earliest scheduled row per key.
  router.post('/call-queue/dedupe-pending-vapi', async (req, res) => {
    try {
      const apiKey = req.get('X-API-Key');
      if (!apiKey || apiKey !== process.env.API_KEY) {
        return res.status(401).json({ ok: false, error: 'Unauthorized' });
      }
      const { dedupePendingVapiCallQueueRows } = await import('../db.js');
      const r = await dedupePendingVapiCallQueueRows();
      console.log('[ADMIN] call-queue dedupe pending vapi', r);
      return res.json({ ok: true, ...r });
    } catch (e) {
      console.error('[ADMIN DEDUPE CALL QUEUE]', e?.message || e);
      return res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  // Clear outbound weekday journey for a number so auto dials can start a fresh Mon–Fri journey (ops).
  router.post('/outbound-weekday-journey/clear', async (req, res) => {
    try {
      const apiKey = req.get('X-API-Key');
      if (!apiKey || apiKey !== process.env.API_KEY) {
        return res.status(401).json({ ok: false, error: 'Unauthorized' });
      }
      const clientKey = req.body?.clientKey != null ? String(req.body.clientKey).trim() : '';
      const leadPhone = req.body?.leadPhone != null ? String(req.body.leadPhone).trim() : '';
      if (!clientKey || !leadPhone) {
        return res.status(400).json({ ok: false, error: 'clientKey and leadPhone are required' });
      }
      const { clearOutboundWeekdayJourneyForReopen } = await import('../db.js');
      const r = await clearOutboundWeekdayJourneyForReopen(clientKey, leadPhone);
      if (!r.ok) {
        return res.status(400).json(r);
      }
      console.log('[ADMIN] outbound weekday journey cleared', { clientKey, deleted: r.deleted });
      return res.json({ ok: true, deleted: r.deleted });
    } catch (e) {
      console.error('[ADMIN CLEAR OUTBOUND JOURNEY]', e?.message || e);
      return res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  return router;
}

