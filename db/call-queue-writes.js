/**
 * Mutating call_queue helpers (SQL routed through db `query()` for SQLite translation).
 */

export async function updateCallQueueStatus(query, id, status) {
  await query(
    `
    UPDATE call_queue 
    SET status = $2, updated_at = now()
    WHERE id = $1
  `,
    [id, status]
  );
}

/** Clear pending call_queue rows (optional clientKey / leadPhone filters). */
export async function clearCallQueue(query, { clientKey, leadPhone } = {}) {
  let result;
  if (!clientKey && !leadPhone) {
    result = await query(`DELETE FROM call_queue WHERE status = 'pending'`);
  } else {
    const conditions = ["status = 'pending'"];
    const params = [];
    let i = 1;
    if (clientKey) {
      conditions.push(`client_key = $${i++}`);
      params.push(clientKey);
    }
    if (leadPhone) {
      conditions.push(`lead_phone = $${i++}`);
      params.push(leadPhone);
    }
    result = await query(`DELETE FROM call_queue WHERE ${conditions.join(' AND ')}`, params);
  }
  return result?.rowCount ?? result?.changes ?? 0;
}
