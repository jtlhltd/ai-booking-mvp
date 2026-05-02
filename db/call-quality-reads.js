/**
 * Call list + quality aggregate reads (extracted from db.js, PR-16 hygiene).
 * Each function is a thin wrapper around `query()` for SQLite vs Postgres routing.
 *
 * `getCallQualityMetrics` takes `deps.getCallAnalyticsFloorIso` to avoid a circular import with db.js.
 */

export async function getCallsByPhone(query, clientKey, leadPhone, limit = 50) {
  const { rows } = await query(
    `
    SELECT
      id, call_id, client_key, lead_phone, status, outcome, duration, cost,
      metadata, retry_attempt,
      LEFT(COALESCE(transcript, ''), 512) AS transcript,
      recording_url, sentiment, quality_score, objections, key_phrases, metrics,
      analyzed_at, created_at, updated_at
    FROM calls
    WHERE client_key = $1 AND lead_phone = $2
    ORDER BY created_at DESC
    LIMIT $3
  `,
    [clientKey, leadPhone, limit]
  );
  return rows;
}

export async function getRecentCallsCount(query, clientKey, minutesBack = 60) {
  const mb = Math.max(1, Math.min(24 * 60, parseInt(String(minutesBack), 10) || 60));
  const { rows } = await query(
    `
    SELECT COUNT(*) as count FROM calls 
    WHERE client_key = $1 AND created_at > now() - interval '${mb} minutes'
  `,
    [clientKey]
  );
  return parseInt(rows[0]?.count || 0, 10);
}

export async function getCallQualityMetrics(query, clientKey, days = 30, deps = {}) {
  const getFloorIso = deps.getCallAnalyticsFloorIso;
  if (typeof getFloorIso !== 'function') {
    throw new Error('getCallQualityMetrics requires deps.getCallAnalyticsFloorIso');
  }
  const dayMs = Math.max(1, Number(days) || 30) * 86400000;
  let sinceMs = Date.now() - dayMs;
  const minIso = await getFloorIso();
  const t = new Date(minIso).getTime();
  if (t > sinceMs) sinceMs = t;
  const since = new Date(sinceMs).toISOString();
  const { rows } = await query(
    `
    SELECT 
      COUNT(*) as total_calls,
      COUNT(*) FILTER (WHERE status = 'completed') as successful_calls,
      COUNT(*) FILTER (WHERE outcome = 'booked') as bookings,
      AVG(quality_score) as avg_quality_score,
      AVG(duration) as avg_duration,
      COUNT(*) FILTER (WHERE sentiment = 'positive') as positive_sentiment_count,
      COUNT(*) FILTER (WHERE sentiment = 'negative') as negative_sentiment_count,
      COUNT(*) FILTER (WHERE sentiment = 'neutral') as neutral_sentiment_count
    FROM calls
    WHERE client_key = $1 
      AND created_at >= $2::timestamptz
      AND quality_score IS NOT NULL
  `,
    [clientKey, since]
  );

  return (
    rows[0] || {
      total_calls: 0,
      successful_calls: 0,
      bookings: 0,
      avg_quality_score: 0,
      avg_duration: 0,
      positive_sentiment_count: 0,
      negative_sentiment_count: 0,
      neutral_sentiment_count: 0
    }
  );
}
