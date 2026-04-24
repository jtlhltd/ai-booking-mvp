/**
 * Read-only call_queue helpers (Postgres-oriented SQL; routed through `query()` for SQLite translation).
 */

export async function getPendingCalls(query, limit = 100) {
  const { rows } = await query(
    `
    WITH due AS (
      SELECT *
      FROM call_queue
      WHERE status = 'pending'
        AND call_type = 'vapi_call'
        AND scheduled_for <= now()
    ),
    heads AS (
      SELECT DISTINCT ON (client_key) *
      FROM due
      ORDER BY client_key, scheduled_for ASC, priority ASC, id ASC
    ),
    picked_heads AS (
      SELECT *
      FROM heads
      ORDER BY scheduled_for ASC, priority ASC, id ASC
      LIMIT LEAST($1::int, 50)
    ),
    rest AS (
      SELECT d.*
      FROM due d
      WHERE NOT EXISTS (SELECT 1 FROM picked_heads ph WHERE ph.id = d.id)
      ORDER BY d.scheduled_for ASC, d.priority ASC, d.id ASC
      LIMIT GREATEST(0, $1::int - (SELECT COUNT(*)::int FROM picked_heads))
    )
    SELECT * FROM picked_heads
    UNION ALL
    SELECT * FROM rest
    `,
    [limit],
  );
  return rows;
}

export async function getCallQueueByTenant(query, clientKey, limit = 100) {
  const { rows } = await query(
    `
    SELECT * FROM call_queue 
    WHERE client_key = $1 
    ORDER BY scheduled_for ASC
    LIMIT $2
  `,
    [clientKey, limit],
  );
  return rows;
}

export async function getCallQueueByPhone(query, clientKey, leadPhone, limit = 50) {
  const { rows } = await query(
    `
    SELECT * FROM call_queue 
    WHERE client_key = $1 AND lead_phone = $2 
    ORDER BY scheduled_for ASC
    LIMIT $3
  `,
    [clientKey, leadPhone, limit],
  );
  return rows;
}
