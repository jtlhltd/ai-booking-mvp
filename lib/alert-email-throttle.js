// Cross-process alert email throttle (Postgres). In-memory caps in query-performance-tracker
// do not apply across multiple web workers / instances — this does.

import { pool } from '../db.js';

const GLOBAL_SLOW_QUERY_KEY = 'slow_query_critical';

let ensuredThrottleTable = false;

async function ensureThrottleTable() {
  if (ensuredThrottleTable || !pool) {
    return;
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS alert_email_throttle (
      alert_key TEXT PRIMARY KEY,
      last_sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool
    .query(
      `CREATE INDEX IF NOT EXISTS alert_email_throttle_sent_idx ON alert_email_throttle (last_sent_at DESC)`
    )
    .catch(() => {
      /* non-fatal */
    });
  ensuredThrottleTable = true;
}

/**
 * Try to reserve the right to send one email for this alert key.
 * Uses pool.query directly so db.js performance tracking is not invoked.
 *
 * @param {string} alertKey
 * @param {number} minIntervalMs
 * @returns {Promise<boolean>} true if the caller should send email
 */
export async function reserveAlertEmailSlot(alertKey, minIntervalMs) {
  if (!pool || !alertKey) {
    return true;
  }
  await ensureThrottleTable();
  const ms = Math.max(1000, Math.floor(Number(minIntervalMs) || 0));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const updated = await client.query(
      `UPDATE alert_email_throttle
       SET last_sent_at = NOW()
       WHERE alert_key = $1
         AND last_sent_at < NOW() - ($2::bigint * INTERVAL '1 millisecond')
       RETURNING 1`,
      [alertKey, ms]
    );
    if ((updated.rowCount || 0) > 0) {
      await client.query('COMMIT');
      return true;
    }
    const inserted = await client.query(
      `INSERT INTO alert_email_throttle (alert_key, last_sent_at)
       VALUES ($1, NOW())
       ON CONFLICT (alert_key) DO NOTHING
       RETURNING 1`,
      [alertKey]
    );
    await client.query('COMMIT');
    return (inserted.rowCount || 0) > 0;
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      /* ignore */
    }
    console.warn('[ALERT THROTTLE] reserve failed (no email):', e.message);
    return false;
  } finally {
    client.release();
  }
}

export { GLOBAL_SLOW_QUERY_KEY };
