/**
 * Demo dashboard diagnostic.
 *
 * GET /api/demo-dashboard-debug/:clientKey
 */
import { Router } from 'express';

/**
 * @param {{ query: (sql: string, params?: any[]) => Promise<{ rows?: any[] }>, fetchImpl?: typeof fetch }} deps
 */
export function createDemoDashboardDebugRouter(deps) {
  const { query, fetchImpl } = deps || {};
  const router = Router();
  const fetchFn = fetchImpl || globalThis.fetch;

  router.get('/demo-dashboard-debug/:clientKey', async (req, res) => {
    const { clientKey } = req.params;
    try {
      const recentCallRows = await query(
        `
        SELECT c.call_id, c.id, c.lead_phone, c.status, c.outcome, c.created_at, c.duration
        FROM calls c
        WHERE c.client_key = $1
        ORDER BY c.created_at DESC
        LIMIT 10
      `,
        [clientKey]
      );
      const rows = recentCallRows.rows || [];
      const hasVapiKey = !!(process.env.VAPI_PRIVATE_KEY || process.env.VAPI_PUBLIC_KEY || '').trim();
      const rowsNeedingOutcome = rows.filter((r) => r.call_id && !r.outcome);
      const vapiResults = [];

      if (hasVapiKey && rowsNeedingOutcome.length > 0) {
        const vapiKey = process.env.VAPI_PRIVATE_KEY || process.env.VAPI_PUBLIC_KEY || '';
        for (const r of rowsNeedingOutcome) {
          try {
            const res2 = await fetchFn(`https://api.vapi.ai/call/${r.call_id}`, {
              headers: { Authorization: `Bearer ${vapiKey}` }
            });
            const data = res2.ok ? await res2.json() : null;
            vapiResults.push({
              call_id: r.call_id,
              lead_phone: r.lead_phone,
              status: r.status,
              vapiStatus: res2.status,
              vapiStatusText: res2.statusText,
              hasData: !!data,
              dataStatus: data?.status ?? null,
              dataEndedReason: data?.endedReason ?? null,
              dataEndedAt: data?.endedAt ?? null,
              dataOutcome: data?.outcome ?? null,
              isEnded: !!(
                data &&
                (['ended', 'completed', 'failed', 'canceled', 'cancelled'].includes((data.status || '').toLowerCase()) ||
                  data.endedReason ||
                  data.endedAt)
              )
            });
          } catch (err) {
            vapiResults.push({ call_id: r.call_id, error: err.message });
          }
        }
      }

      res.set('Cache-Control', 'no-store');
      return res.json({
        clientKey,
        hasVapiKey,
        recentCallsCount: rows.length,
        rowsWithCallId: rows.filter((r) => r.call_id).length,
        rowsWithOutcome: rows.filter((r) => r.outcome).length,
        rowsNeedingOutcome: rowsNeedingOutcome.length,
        recentCallsSummary: rows.map((r) => ({
          call_id: r.call_id ? `${String(r.call_id).slice(0, 8)}...` : null,
          status: r.status,
          outcome: r.outcome,
          hasOutcome: !!r.outcome
        })),
        vapiFallbackResults: vapiResults,
        hint: !hasVapiKey
          ? 'VAPI key missing — set VAPI_PRIVATE_KEY or VAPI_PUBLIC_KEY on Render so fallback can fetch outcomes.'
          : rowsNeedingOutcome.length === 0
            ? 'All recent calls already have outcome, or no call_id in DB.'
            : 'Check vapiFallbackResults: if vapiStatus !== 200 or isEnded is false, that explains \"Result not received\".'
      });
    } catch (err) {
      console.error('[DEMO DASHBOARD DEBUG]', err);
      return res.status(500).json({ error: err.message });
    }
  });

  return router;
}

