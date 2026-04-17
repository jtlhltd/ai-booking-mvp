/**
 * Admin API: outbound weekday-journey maintenance endpoints.
 * Mounted at /api/admin — paths here are /outbound-weekday-journey/*.
 */
import { Router } from 'express';

/**
 * @param {{
 *   query: (sql: string, params?: any[]) => Promise<{ rows?: any[] }>,
 *   getFullClient: (clientKey: string, opts?: any) => Promise<any>,
 *   pickTimezone: (client: any) => string,
 *   DateTime: any,
 *   isPostgres: boolean,
 * }} deps
 */
export function createAdminOutboundWeekdayJourneyRouter(deps) {
  const { query, getFullClient, pickTimezone, DateTime, isPostgres } = deps || {};
  const router = Router();

  /**
   * Admin ops: clear today's weekday-journey slot claims for a client.
   *
   * This unblocks `weekday_slot_used` deferrals for the current local weekday only,
   * without wiping the whole outbound_weekday_journey history.
   *
   * POST /api/admin/outbound-weekday-journey/clear-today/:clientKey?limit=5000
   */
  router.post('/outbound-weekday-journey/clear-today/:clientKey', async (req, res) => {
    const { clientKey } = req.params;
    const limitRaw = req.query.limit ?? req.body?.limit;
    const limit = Math.max(1, Math.min(50000, parseInt(String(limitRaw ?? '5000'), 10) || 5000));

    try {
      if (!isPostgres) return res.status(400).json({ ok: false, error: 'postgres_required' });
      const client = await getFullClient(clientKey, { bypassCache: false });
      if (!client || !client.clientKey) {
        return res.status(404).json({ ok: false, error: 'client_not_found' });
      }

      const tz = pickTimezone(client);
      const nowLocal = DateTime.now().setZone(tz);
      if (!nowLocal.isValid) {
        return res.status(400).json({ ok: false, error: 'invalid_timezone', timezone: tz });
      }
      const isodow = nowLocal.weekday; // 1..7 (Mon..Sun)
      if (isodow < 1 || isodow > 7) {
        return res.status(400).json({ ok: false, error: 'invalid_weekday', timezone: tz });
      }
      // Only meaningful for Mon–Fri: bits 0..4
      if (isodow > 5) {
        return res.status(400).json({ ok: false, error: 'weekend', timezone: tz, weekday: isodow });
      }
      const bit = 1 << (isodow - 1);

      // Clear today's bit for up to `limit` rows that currently have it set.
      const { rows } = await query(
        `
        WITH picked AS (
          SELECT phone_match_key
          FROM outbound_weekday_journey
          WHERE client_key = $1
            AND (weekday_mask & $2::int) <> 0
          ORDER BY updated_at DESC NULLS LAST, phone_match_key
          LIMIT $3
        )
        UPDATE outbound_weekday_journey j
        SET weekday_mask = (j.weekday_mask::int & (~$2::int))::smallint,
            -- If a journey was marked closed due to weekdays_exhausted, reopening is safe when we clear a bit.
            closed_at = CASE WHEN j.closed_reason = 'weekdays_exhausted' THEN NULL ELSE j.closed_at END,
            closed_reason = CASE WHEN j.closed_reason = 'weekdays_exhausted' THEN NULL ELSE j.closed_reason END,
            updated_at = NOW()
        FROM picked p
        WHERE j.client_key = $1
          AND j.phone_match_key = p.phone_match_key
        RETURNING j.phone_match_key
      `,
        [clientKey, bit, limit]
      );

      res.set('Cache-Control', 'no-store, must-revalidate, max-age=0');
      return res.json({
        ok: true,
        clientKey,
        timezone: tz,
        weekdayIsoDow: isodow,
        clearedBit: bit,
        limit,
        cleared: rows?.length || 0
      });
    } catch (e) {
      console.error('[ADMIN CLEAR TODAY JOURNEY] Error:', e);
      return res.status(500).json({ ok: false, error: String(e?.message || e).slice(0, 240) });
    }
  });

  return router;
}

