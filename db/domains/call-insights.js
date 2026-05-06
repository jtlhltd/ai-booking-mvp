import { getCallAnalyticsEnvOverrideIso } from '../../lib/call-analytics-cutoff.js';

export function createCallInsightsDomain({ dbType, pool, sqlite, query }) {
  if (typeof query !== 'function') throw new Error('createCallInsightsDomain requires query');

  let _callAnalyticsFloorIsoCache = null;

  async function upsertCallInsights({ clientKey, periodDays = 30, insights, routing = null, computedAt = null }) {
    const insightsJson = insights ? JSON.stringify(insights) : JSON.stringify({});
    const routingJson = routing ? JSON.stringify(routing) : null;
    await query(
      `
      INSERT INTO call_insights (client_key, period_days, insights, routing, computed_at, updated_at)
      VALUES ($1, $2, $3::jsonb, $4::jsonb, COALESCE($5::timestamptz, now()), now())
      ON CONFLICT (client_key)
      DO UPDATE SET
        period_days = EXCLUDED.period_days,
        insights = EXCLUDED.insights,
        routing = EXCLUDED.routing,
        computed_at = EXCLUDED.computed_at,
        updated_at = now()
    `,
      [clientKey, periodDays, insightsJson, routingJson, computedAt]
    );
  }

  async function getLatestCallInsights(clientKey) {
    const { rows } = await query(
      `
      SELECT client_key, period_days, insights, routing, computed_at
      FROM call_insights
      WHERE client_key = $1
      LIMIT 1
    `,
      [clientKey]
    );
    return rows?.[0] || null;
  }

  /**
   * Earliest call.created_at included in bandit + insights + call-quality windows.
   * Persists `floor_at` in DB (set on first init); optional env CALL_ANALYTICS_SINCE overrides.
   */
  async function getCallAnalyticsFloorIso() {
    const envIso = getCallAnalyticsEnvOverrideIso();
    if (envIso) return envIso;
    if (_callAnalyticsFloorIsoCache) return _callAnalyticsFloorIsoCache;

    try {
      const DEFAULT_FLOOR_DAYS = 365;
      if (dbType === 'postgres' && pool) {
        await query(`
          INSERT INTO call_analytics_floor (id, floor_at)
          VALUES (1, now() - INTERVAL '${DEFAULT_FLOOR_DAYS} days')
          ON CONFLICT (id) DO NOTHING
        `);
      } else if (sqlite) {
        await query(`INSERT OR IGNORE INTO call_analytics_floor (id, floor_at) VALUES (1, datetime('now'))`);
      } else {
        _callAnalyticsFloorIsoCache = new Date().toISOString();
        return _callAnalyticsFloorIsoCache;
      }
      const { rows } = await query(`SELECT floor_at FROM call_analytics_floor WHERE id = 1`);
      const t = rows?.[0]?.floor_at;

      // If the floor was initialized too recently (e.g. first boot), widen it so analytics/learning
      // can see meaningful history. This is idempotent and only ever moves the floor earlier.
      if (dbType === 'postgres' && pool && t) {
        const floorMs = new Date(t).getTime();
        const minMs = Date.now() - DEFAULT_FLOOR_DAYS * 86400000;
        if (Number.isFinite(floorMs) && floorMs > minMs) {
          await query(`UPDATE call_analytics_floor SET floor_at = NOW() - INTERVAL '${DEFAULT_FLOOR_DAYS} days' WHERE id = 1`);
          const { rows: rr } = await query(`SELECT floor_at FROM call_analytics_floor WHERE id = 1`);
          const tt = rr?.[0]?.floor_at;
          _callAnalyticsFloorIsoCache = tt ? new Date(tt).toISOString() : new Date().toISOString();
          return _callAnalyticsFloorIsoCache;
        }
      }

      _callAnalyticsFloorIsoCache = t ? new Date(t).toISOString() : new Date().toISOString();
    } catch (e) {
      console.warn('[call_analytics_floor]', e.message);
      _callAnalyticsFloorIsoCache = new Date().toISOString();
    }
    return _callAnalyticsFloorIsoCache;
  }

  return { upsertCallInsights, getLatestCallInsights, getCallAnalyticsFloorIso };
}

