export function createRetryQueueDomain({ query }) {
  if (typeof query !== 'function') throw new Error('createRetryQueueDomain requires query');

  async function addToRetryQueue({
    clientKey,
    leadPhone,
    retryType,
    retryReason,
    retryData,
    scheduledFor,
    retryAttempt = 1,
    maxRetries = 3,
  }) {
    const retryDataJson = retryData ? JSON.stringify(retryData) : null;

    const { rows } = await query(
      `
      INSERT INTO retry_queue (client_key, lead_phone, retry_type, retry_reason, retry_data, scheduled_for, retry_attempt, max_retries, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
      RETURNING *
    `,
      [clientKey, leadPhone, retryType, retryReason, retryDataJson, scheduledFor, retryAttempt, maxRetries]
    );

    return rows[0];
  }

  async function getPendingRetries(limit = 100, retryTypes = ['vapi_call']) {
    const safeLimit = Math.max(1, Math.min(1000, parseInt(limit, 10) || 100));
    const types =
      Array.isArray(retryTypes) && retryTypes.length
        ? retryTypes.map((t) => String(t || '').trim()).filter(Boolean)
        : ['vapi_call'];
    const placeholders = types.map((_, i) => `$${i + 1}`).join(', ');
    const { rows } = await query(
      `
      SELECT * FROM retry_queue
      WHERE status = 'pending' AND scheduled_for <= now()
        AND retry_type IN (${placeholders})
      ORDER BY scheduled_for ASC
      LIMIT $${types.length + 1}
    `,
      [...types, safeLimit]
    );
    return rows;
  }

  async function updateRetryStatus(id, status, retryAttempt = null) {
    const updates = ['status = $2', 'updated_at = now()'];
    const params = [id, status];

    if (retryAttempt !== null) {
      updates.push('retry_attempt = $3');
      params.push(retryAttempt);
    }

    await query(
      `
      UPDATE retry_queue
      SET ${updates.join(', ')}
      WHERE id = $1
    `,
      params
    );
  }

  async function getRetriesByPhone(clientKey, leadPhone, limit = 50) {
    const { rows } = await query(
      `
      SELECT * FROM retry_queue
      WHERE client_key = $1 AND lead_phone = $2
      ORDER BY created_at DESC
      LIMIT $3
    `,
      [clientKey, leadPhone, limit]
    );
    return rows;
  }

  async function cancelPendingRetries(clientKey, leadPhone) {
    await query(
      `
      UPDATE retry_queue
      SET status = 'cancelled', updated_at = now()
      WHERE client_key = $1 AND lead_phone = $2 AND status = 'pending'
    `,
      [clientKey, leadPhone]
    );

    console.log(`[DB] Cancelled pending retries for ${leadPhone} (${clientKey})`);
  }

  /** Cancels only automated follow-up rows (not technical vapi_call retries). */
  async function cancelPendingFollowUps(clientKey, leadPhone) {
    await query(
      `
      UPDATE retry_queue
      SET status = 'cancelled', updated_at = now()
      WHERE client_key = $1 AND lead_phone = $2 AND status = 'pending'
        AND retry_reason LIKE 'follow\\_up\\_%' ESCAPE '\\'
    `,
      [clientKey, leadPhone]
    );
  }

  async function cleanupOldRetries(daysOld = 7) {
    await query(
      `
      DELETE FROM retry_queue
      WHERE created_at < now() - interval '${daysOld} days'
        AND status IN ('completed', 'failed', 'cancelled')
    `
    );
  }

  return {
    addToRetryQueue,
    getPendingRetries,
    updateRetryStatus,
    getRetriesByPhone,
    cancelPendingRetries,
    cancelPendingFollowUps,
    cleanupOldRetries,
  };
}

