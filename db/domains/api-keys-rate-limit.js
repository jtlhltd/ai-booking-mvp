/**
 * API key listing + rate-limit tracking (extracted from db.js facade).
 */
export function createApiKeysRateLimitDomain({ query }) {
  if (typeof query !== 'function') throw new Error('createApiKeysRateLimitDomain requires query');

  async function updateApiKeyLastUsed(keyId) {
    await query(
      `
    UPDATE api_keys 
    SET last_used = now()
    WHERE id = $1
  `,
      [keyId]
    );
  }

  async function getApiKeysByClient(clientKey) {
    const { rows } = await query(
      `
    SELECT id, key_name, permissions, rate_limit_per_minute, rate_limit_per_hour, is_active, last_used, expires_at, created_at
    FROM api_keys 
    WHERE client_key = $1
    ORDER BY created_at DESC
  `,
      [clientKey]
    );
    return rows;
  }

  async function checkRateLimit({ clientKey, apiKeyId, endpoint, ipAddress, limitPerMinute, limitPerHour }) {
    const now = new Date();
    const minuteAgo = new Date(now.getTime() - 60 * 1000);
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const { rows: minuteRows } = await query(
      `
    SELECT COUNT(*) as count FROM rate_limit_tracking 
    WHERE client_key = $1 
    AND (api_key_id = $2 OR api_key_id IS NULL)
    AND endpoint = $3
    AND (ip_address = $4 OR ip_address IS NULL)
    AND window_start > $5
  `,
      [clientKey, apiKeyId, endpoint, ipAddress, minuteAgo]
    );

    const minuteCount = parseInt(minuteRows[0]?.count || 0);

    const { rows: hourRows } = await query(
      `
    SELECT COUNT(*) as count FROM rate_limit_tracking 
    WHERE client_key = $1 
    AND (api_key_id = $2 OR api_key_id IS NULL)
    AND endpoint = $3
    AND (ip_address = $4 OR ip_address IS NULL)
    AND window_start > $5
  `,
      [clientKey, apiKeyId, endpoint, ipAddress, hourAgo]
    );

    const hourCount = parseInt(hourRows[0]?.count || 0);

    const exceeded = minuteCount >= limitPerMinute || hourCount >= limitPerHour;

    return {
      exceeded,
      minuteCount,
      hourCount,
      minuteLimit: limitPerMinute,
      hourLimit: limitPerHour,
      remainingMinute: Math.max(0, limitPerMinute - minuteCount),
      remainingHour: Math.max(0, limitPerHour - hourCount)
    };
  }

  async function recordRateLimitRequest({ clientKey, apiKeyId, endpoint, ipAddress }) {
    await query(
      `
    INSERT INTO rate_limit_tracking (client_key, api_key_id, endpoint, ip_address)
    VALUES ($1, $2, $3, $4)
  `,
      [clientKey, apiKeyId, endpoint, ipAddress]
    );
  }

  async function cleanupOldRateLimitRecords(hoursOld = 24) {
    await query(`
    DELETE FROM rate_limit_tracking 
    WHERE window_start < now() - interval '${hoursOld} hours'
  `);
  }

  return {
    updateApiKeyLastUsed,
    getApiKeysByClient,
    checkRateLimit,
    recordRateLimitRequest,
    cleanupOldRateLimitRecords
  };
}
