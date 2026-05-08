export function createCallsDomain({ query, getCallAnalyticsFloorIso }) {
  async function getCallsByTenant(clientKey, limit = 100) {
    const { rows } = await query(
      `
      SELECT
        id, call_id, client_key, lead_phone, status, outcome, duration, cost,
        metadata, retry_attempt,
        LEFT(COALESCE(transcript, ''), 512) AS transcript,
        recording_url, sentiment, quality_score, objections, key_phrases, metrics,
        analyzed_at, created_at, updated_at
      FROM calls
      WHERE client_key = $1
      ORDER BY created_at DESC
      LIMIT $2
    `,
      [clientKey, limit]
    );
    return rows;
  }

  async function getCallsByPhone(clientKey, leadPhone, limit = 50) {
    // Strict match retained for existing callers.
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

  async function getCallsByPhoneLoose(clientKey, leadPhone, leadDigits, limit = 50) {
    const digits = String(leadDigits || '').replace(/\D+/g, '').trim();
    const last10 = digits.length >= 10 ? digits.slice(-10) : '';
    const { rows } = await query(
      `
      SELECT
        id, call_id, client_key, lead_phone, status, outcome, duration, cost,
        metadata, retry_attempt,
        LEFT(COALESCE(transcript, ''), 512) AS transcript,
        recording_url, sentiment, quality_score, objections, key_phrases, metrics,
        analyzed_at, created_at, updated_at
      FROM calls
      WHERE client_key = $1
        AND (
          lead_phone = $2
          OR ($3 <> '' AND regexp_replace(lead_phone, '\\D', '', 'g') = $3)
          OR ($4 <> '' AND RIGHT(regexp_replace(lead_phone, '\\D', '', 'g'), 10) = $4)
        )
      ORDER BY created_at DESC
      LIMIT $5
    `,
      [clientKey, leadPhone, digits, last10, limit]
    );
    return rows;
  }

  async function getCallsByPhoneLooseWithFullTranscript(clientKey, leadPhone, leadDigits, limit = 50) {
    const digits = String(leadDigits || '').replace(/\D+/g, '').trim();
    const last10 = digits.length >= 10 ? digits.slice(-10) : '';
    const { rows } = await query(
      `
      SELECT
        id, call_id, client_key, lead_phone, status, outcome, duration, cost,
        metadata, retry_attempt,
        COALESCE(transcript, '') AS transcript,
        recording_url, sentiment, quality_score, objections, key_phrases, metrics,
        analyzed_at, created_at, updated_at
      FROM calls
      WHERE client_key = $1
        AND (
          lead_phone = $2
          OR ($3 <> '' AND regexp_replace(lead_phone, '\\D', '', 'g') = $3)
          OR ($4 <> '' AND RIGHT(regexp_replace(lead_phone, '\\D', '', 'g'), 10) = $4)
        )
      ORDER BY created_at DESC
      LIMIT $5
    `,
      [clientKey, leadPhone, digits, last10, limit]
    );
    return rows;
  }

  async function getRecentCallsCount(clientKey, minutesBack = 60) {
    const { rows } = await query(
      `
      SELECT COUNT(*) as count FROM calls 
      WHERE client_key = $1 AND created_at > now() - interval '${minutesBack} minutes'
    `,
      [clientKey]
    );
    return parseInt(rows[0]?.count || 0);
  }

  async function getCallQualityMetrics(clientKey, days = 30) {
    const dayMs = Math.max(1, Number(days) || 30) * 86400000;
    let sinceMs = Date.now() - dayMs;
    const minIso = typeof getCallAnalyticsFloorIso === 'function' ? await getCallAnalyticsFloorIso() : null;
    if (minIso) {
      const t = new Date(minIso).getTime();
      if (t > sinceMs) sinceMs = t;
    }
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
        neutral_sentiment_count: 0,
      }
    );
  }

  return {
    getCallsByTenant,
    getCallsByPhone,
    getCallsByPhoneLoose,
    getCallsByPhoneLooseWithFullTranscript,
    getRecentCallsCount,
    getCallQualityMetrics,
  };
}

