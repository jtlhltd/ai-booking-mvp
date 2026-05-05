/**
 * Analytics events + conversion funnel query cluster.
 *
 * Extracted from db.js (PR-11 of the hygiene burndown). Each function is
 * a thin wrapper around `query()` so SQLite vs Postgres routing stays in
 * one place. db.js re-exports each function with the runner-bound `query`
 * baked in to preserve back-compat.
 *
 * Tables involved:
 *   - analytics_events   (UI / dashboard / API events; trackAnalyticsEvent / get*)
 *   - conversion_funnel  (per-lead funnel stage transitions)
 *
 * NOTE: the days→interval helper below intentionally **does not** accept
 * arbitrary user input (it coerces to a non-negative integer); the result
 * is interpolated into the SQL because Postgres INTERVAL literals can't
 * be parameterized.
 */

function safeDays(days, fallback = 7) {
  const n = Number.parseInt(days, 10);
  if (!Number.isFinite(n) || n < 0) return fallback;
  // Cap at one year to keep the SQL bounded.
  return Math.min(n, 365);
}

// ---------------------------------------------------------------------------
// analytics_events
// ---------------------------------------------------------------------------

export async function trackAnalyticsEvent(query, { clientKey, eventType, eventCategory, eventData, sessionId, userAgent, ipAddress }) {
  const eventDataJson = eventData ? JSON.stringify(eventData) : null;
  const { rows } = await query(
    `
    INSERT INTO analytics_events (client_key, event_type, event_category, event_data, session_id, user_agent, ip_address)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
    `,
    [clientKey, eventType, eventCategory, eventDataJson, sessionId, userAgent, ipAddress],
  );
  return rows[0];
}

export async function getAnalyticsEvents(query, clientKey, limit = 100, eventType = null) {
  let queryStr = `
    SELECT * FROM analytics_events
    WHERE client_key = $1
  `;
  const params = [clientKey];
  if (eventType) {
    queryStr += ` AND event_type = $2`;
    params.push(eventType);
  }
  queryStr += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
  params.push(limit);

  const { rows } = await query(queryStr, params);
  return rows;
}

export async function getAnalyticsSummary(query, clientKey, days = 7) {
  const safe = safeDays(days);
  const { rows } = await query(
    `
    SELECT
      event_type,
      event_category,
      COUNT(*) as event_count,
      COUNT(DISTINCT session_id) as unique_sessions,
      COUNT(DISTINCT ip_address) as unique_ips
    FROM analytics_events
    WHERE client_key = $1
      AND created_at > now() - interval '${safe} days'
    GROUP BY event_type, event_category
    ORDER BY event_count DESC
    `,
    [clientKey],
  );
  return rows;
}

// ---------------------------------------------------------------------------
// conversion_funnel
// ---------------------------------------------------------------------------

export async function trackConversionStage(query, { clientKey, leadPhone, stage, stageData, previousStage = null, timeToStage = null }) {
  const stageDataJson = stageData ? JSON.stringify(stageData) : null;
  const { rows } = await query(
    `
    INSERT INTO conversion_funnel (client_key, lead_phone, stage, stage_data, previous_stage, time_to_stage)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
    `,
    [clientKey, leadPhone, stage, stageDataJson, previousStage, timeToStage],
  );
  return rows[0];
}

export async function getConversionFunnel(query, clientKey, days = 30) {
  const safe = safeDays(days, 30);
  const { rows } = await query(
    `
    SELECT
      stage,
      COUNT(*) as stage_count,
      COUNT(DISTINCT lead_phone) as unique_leads,
      AVG(time_to_stage) as avg_time_to_stage
    FROM conversion_funnel
    WHERE client_key = $1
      AND created_at > now() - interval '${safe} days'
    GROUP BY stage
    ORDER BY stage_count DESC
    `,
    [clientKey],
  );
  return rows;
}

export async function getConversionRates(query, clientKey, days = 30) {
  const safe = safeDays(days, 30);
  const { rows } = await query(
    `
    WITH stage_counts AS (
      SELECT
        stage,
        COUNT(DISTINCT lead_phone) as unique_leads
      FROM conversion_funnel
      WHERE client_key = $1
        AND created_at > now() - interval '${safe} days'
      GROUP BY stage
    ),
    total_leads AS (
      SELECT COUNT(DISTINCT lead_phone) as total FROM conversion_funnel
      WHERE client_key = $1
        AND created_at > now() - interval '${safe} days'
    )
    SELECT
      sc.stage,
      sc.unique_leads,
      tl.total,
      ROUND((sc.unique_leads::DECIMAL / tl.total) * 100, 2) as conversion_rate
    FROM stage_counts sc
    CROSS JOIN total_leads tl
    ORDER BY sc.unique_leads DESC
    `,
    [clientKey],
  );
  return rows;
}
