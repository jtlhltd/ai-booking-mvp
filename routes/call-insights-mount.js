import { Router } from 'express';
import { loadDashboardCallQualityPayload } from '../lib/dashboard-call-quality.js';

export function createCallInsightsRouter(deps) {
  const { cacheMiddleware, poolQuerySelect, query } = deps || {};
  const router = Router();

  // API endpoint for dashboard call quality metrics (7-day window; aligns with main dashboard “answered” heuristics)
  router.get(
    '/call-quality/:clientKey',
    cacheMiddleware({ ttl: 60000, keyPrefix: 'call-quality:v10:' }),
    async (req, res) => {
      try {
        const { clientKey } = req.params;
        const payload = await loadDashboardCallQualityPayload(clientKey, { poolQuerySelect });
        if (!payload) {
          return res.status(500).json({ ok: false, error: 'call_quality_unavailable' });
        }
        return res.json(payload);
      } catch (error) {
        console.error('[CALL QUALITY ERROR]', error);
        return res.status(500).json({ ok: false, error: error.message });
      }
    },
  );

  function parseCallInsightsRoutingBlob(routing) {
    if (routing == null) return null;
    if (typeof routing === 'string') {
      try {
        return JSON.parse(routing);
      } catch {
        return null;
      }
    }
    return typeof routing === 'object' ? routing : null;
  }

  // Aggregated “learning loop” insights from transcripts + routing recommendations
  router.get(
    '/call-insights/:clientKey',
    cacheMiddleware({ ttl: 60000, keyPrefix: 'call-insights:v1:' }),
    async (req, res) => {
      try {
        const { clientKey } = req.params;
        const days = Math.max(1, Math.min(120, parseInt(req.query.days || 30, 10) || 30));
        const { getLatestCallInsights, upsertCallInsights, getFullClient, getCallAnalyticsFloorIso } =
          await import('../db.js');
        const existing = await getLatestCallInsights(clientKey);
        if (existing && existing.insights) {
          const floorIso = await getCallAnalyticsFloorIso();
          const r = parseCallInsightsRoutingBlob(existing.routing);
          const storedSince = r?.howCalculated?.analyticsSince ?? null;
          if (storedSince === floorIso) {
            return res.json({ ok: true, source: 'cache', ...existing });
          }
        }

        const client = await getFullClient(clientKey).catch(() => null);
        const timeZone = client?.timezone || client?.booking?.timezone || process.env.TZ || 'UTC';
        const { computeAndStoreCallInsights } = await import('../lib/call-insights-engine.js');
        const computed = await computeAndStoreCallInsights({
          query,
          clientKey,
          days,
          timeZone,
          upsertCallInsights,
        });
        return res.json({
          ok: true,
          source: 'computed',
          client_key: clientKey,
          period_days: days,
          insights: computed.insights,
          routing: computed.routing,
          computed_at: new Date().toISOString(),
        });
      } catch (error) {
        console.error('[CALL INSIGHTS ERROR]', error);
        res.status(500).json({ ok: false, error: error.message });
      }
    },
  );

  router.post('/call-insights/:clientKey/recompute', async (req, res) => {
    try {
      const { clientKey } = req.params;
      const days = Math.max(
        1,
        Math.min(120, parseInt((req.body && req.body.days) || req.query.days || 30, 10) || 30),
      );
      const { upsertCallInsights, getFullClient } = await import('../db.js');
      const client = await getFullClient(clientKey).catch(() => null);
      const timeZone = client?.timezone || client?.booking?.timezone || process.env.TZ || 'UTC';
      const { computeAndStoreCallInsights } = await import('../lib/call-insights-engine.js');
      const computed = await computeAndStoreCallInsights({
        query,
        clientKey,
        days,
        timeZone,
        upsertCallInsights,
      });
      res.set('Cache-Control', 'no-store');
      return res.json({
        ok: true,
        source: 'recomputed',
        client_key: clientKey,
        period_days: days,
        insights: computed.insights,
        routing: computed.routing,
        computed_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[CALL INSIGHTS RECOMPUTE ERROR]', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  return router;
}

