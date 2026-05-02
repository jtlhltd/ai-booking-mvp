/**
 * DB-backed global Vapi outbound slot leases (Postgres + SQLite).
 * Coordinates max concurrent Vapi /call across multiple Node processes.
 *
 * Jest default: disabled (memory limiter in instant-calling). Enable with
 * VAPI_DB_SLOT_LEASE=1 for canaries / integration tests.
 */

import { randomUUID } from 'crypto';

/** Advisory lock keys (global pool). */
const VAPI_LEASE_LOCK_K1 = 98237412;
const VAPI_LEASE_LOCK_K2 = 1;

let cachedInstanceId = null;
export function getInstanceId() {
  if (cachedInstanceId) return cachedInstanceId;
  const fromEnv = String(process.env.VAPI_INSTANCE_ID || '').trim();
  cachedInstanceId = fromEnv || `pid_${process.pid}_${randomUUID().slice(0, 8)}`;
  return cachedInstanceId;
}

export function resetVapiInstanceIdForTests() {
  cachedInstanceId = null;
}

export function shouldUseDbSlotLeases() {
  const ex = String(process.env.VAPI_DB_SLOT_LEASE || '').trim().toLowerCase();
  if (ex === '0' || ex === 'false' || ex === 'no') return false;
  if (ex === '1' || ex === 'true' || ex === 'yes') return true;
  if (process.env.JEST_WORKER_ID) return false;
  return true;
}

export function getDefaultLeaseTtlMs() {
  const n = Number(process.env.VAPI_SLOT_LEASE_TTL_MS || 45 * 60 * 1000);
  return Math.max(5 * 60 * 1000, Number.isFinite(n) ? n : 45 * 60 * 1000);
}

export function getMaxConcurrentSlots() {
  return Math.max(1, Math.min(50, Number(process.env.VAPI_MAX_CONCURRENT || 1) || 1));
}

/** @type {Set<string>} */
const heldLeaseIdsThisProcess = new Set();

export function getHeldDbLeaseCount() {
  return heldLeaseIdsThisProcess.size;
}

export function getHeldDbLeaseCountForTests() {
  return heldLeaseIdsThisProcess.size;
}

export function clearHeldDbLeasesForTests() {
  heldLeaseIdsThisProcess.clear();
}

function forgetHeld(leaseId) {
  if (leaseId) heldLeaseIdsThisProcess.delete(String(leaseId));
}

/**
 * Try once to insert a lease row when global active count < max.
 * @returns {Promise<{ ok: true, leaseId: string } | { ok: false, reason: string }>}
 */
export async function tryAcquireDbLeaseOnce() {
  const { pool, dbType, runSqliteTransactionImmediate, getSqliteDatabase } = await import('../db.js');
  const max = getMaxConcurrentSlots();
  const ttlMs = getDefaultLeaseTtlMs();
  const instanceId = getInstanceId();
  const leaseId = randomUUID();
  const now = new Date();
  const expires = new Date(now.getTime() + ttlMs);

  if (dbType === 'postgres' && pool) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1, $2)', [VAPI_LEASE_LOCK_K1, VAPI_LEASE_LOCK_K2]);
      const cnt = await client.query(
        `SELECT COUNT(*)::int AS n FROM vapi_slot_leases WHERE expires_at > NOW()`
      );
      const n = Number(cnt.rows?.[0]?.n ?? 0);
      if (n >= max) {
        await client.query('ROLLBACK');
        return { ok: false, reason: 'at_cap' };
      }
      const ins = await client.query(
        `
        INSERT INTO vapi_slot_leases (lease_id, call_id, instance_id, acquired_at, expires_at)
        VALUES ($1::uuid, NULL, $2, NOW(), $3::timestamptz)
        RETURNING lease_id::text AS lease_id
        `,
        [leaseId, instanceId, expires.toISOString()]
      );
      await client.query('COMMIT');
      const id = String(ins.rows?.[0]?.lease_id || leaseId);
      heldLeaseIdsThisProcess.add(id);
      return { ok: true, leaseId: id };
    } catch (e) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore */
      }
      throw e;
    } finally {
      client.release();
    }
  }

  if (dbType === 'sqlite' && typeof runSqliteTransactionImmediate === 'function') {
    const sqlite = typeof getSqliteDatabase === 'function' ? getSqliteDatabase() : null;
    if (!sqlite) return { ok: false, reason: 'no_sqlite' };
    const result = runSqliteTransactionImmediate(() => {
      const row = sqlite
        .prepare(`SELECT COUNT(*) AS c FROM vapi_slot_leases WHERE datetime(expires_at) > datetime('now')`)
        .get();
      const c = Number(row?.c ?? 0);
      if (c >= max) return { ok: false, reason: 'at_cap' };
      const nowIso = now.toISOString();
      const expIso = expires.toISOString();
      sqlite
        .prepare(
          `INSERT INTO vapi_slot_leases (lease_id, call_id, instance_id, acquired_at, expires_at)
           VALUES (?, NULL, ?, ?, ?)`
        )
        .run(leaseId, instanceId, nowIso, expIso);
      return { ok: true, leaseId };
    });
    if (!result?.ok) return result;
    heldLeaseIdsThisProcess.add(String(result.leaseId));
    return result;
  }

  return { ok: false, reason: 'unsupported_db' };
}

/**
 * @param {string} leaseId
 * @param {string} callId
 */
export async function linkDbLeaseToCallId(leaseId, callId) {
  if (!leaseId || !callId) return;
  const { query, dbType } = await import('../db.js');
  const ttlMs = getDefaultLeaseTtlMs();
  const newExp = new Date(Date.now() + ttlMs).toISOString();

  if (dbType === 'postgres') {
    await query(
      `UPDATE vapi_slot_leases SET call_id = $2, expires_at = $3::timestamptz WHERE lease_id = $1::uuid AND call_id IS NULL`,
      [leaseId, callId, newExp]
    );
  } else {
    await query(
      `UPDATE vapi_slot_leases SET call_id = $2, expires_at = $3 WHERE lease_id = $1 AND call_id IS NULL`,
      [leaseId, callId, newExp]
    );
  }
}

/**
 * @param {string} callId
 */
export async function releaseDbLeaseByCallId(callId) {
  if (!callId) return { deleted: 0 };
  const { query, dbType } = await import('../db.js');
  const r =
    dbType === 'postgres'
      ? await query(
          `DELETE FROM vapi_slot_leases WHERE call_id = $1 RETURNING lease_id::text AS lease_id`,
          [callId]
        )
      : await query(`DELETE FROM vapi_slot_leases WHERE call_id = $1 RETURNING lease_id`, [callId]);
  const lid = r.rows?.[0]?.lease_id;
  forgetHeld(lid);
  return { deleted: r.rowCount ?? r.rows?.length ?? 0 };
}

/**
 * @param {string} leaseId
 */
export async function releaseDbLeaseByLeaseId(leaseId) {
  if (!leaseId) return { deleted: 0 };
  const { query, dbType } = await import('../db.js');
  const r =
    dbType === 'postgres'
      ? await query(`DELETE FROM vapi_slot_leases WHERE lease_id = $1::uuid RETURNING lease_id::text`, [leaseId])
      : await query(`DELETE FROM vapi_slot_leases WHERE lease_id = $1 RETURNING lease_id`, [leaseId]);
  forgetHeld(leaseId);
  return { deleted: r.rowCount ?? r.rows?.length ?? 0 };
}

/** @returns {Promise<number>} rows deleted */
export async function reapExpiredDbLeases() {
  const { query, dbType } = await import('../db.js');
  if (dbType === 'postgres') {
    const r = await query(`DELETE FROM vapi_slot_leases WHERE expires_at < NOW()`);
    return r.rowCount ?? 0;
  }
  const r = await query(`DELETE FROM vapi_slot_leases WHERE datetime(expires_at) <= datetime('now')`);
  return Number(r.changes ?? r.rowCount ?? 0);
}

/** Active leases globally (expires_at in the future). */
export async function countActiveDbLeases() {
  const { query, dbType } = await import('../db.js');
  if (dbType === 'postgres') {
    const r = await query(`SELECT COUNT(*)::int AS n FROM vapi_slot_leases WHERE expires_at > NOW()`);
    return Number(r.rows?.[0]?.n ?? 0);
  }
  const r = await query(
    `SELECT COUNT(*) AS n FROM vapi_slot_leases WHERE datetime(expires_at) > datetime('now')`
  );
  return Number(r.rows?.[0]?.n ?? 0);
}

/**
 * For canaries: run lease acquire against an isolated better-sqlite3 Database.
 * @param {import('better-sqlite3').Database} memDb
 * @param {string} instanceId
 */
export function tryAcquireLeaseOnSqliteDb(memDb, instanceId) {
  const max = getMaxConcurrentSlots();
  const ttlMs = getDefaultLeaseTtlMs();
  const leaseId = randomUUID();
  const now = new Date();
  const expires = new Date(now.getTime() + ttlMs);
  return memDb.transaction(
    () => {
      const row = memDb
        .prepare(`SELECT COUNT(*) AS c FROM vapi_slot_leases WHERE datetime(expires_at) > datetime('now')`)
        .get();
      const c = Number(row?.c ?? 0);
      if (c >= max) return { ok: false, reason: 'at_cap' };
      memDb
        .prepare(
          `INSERT INTO vapi_slot_leases (lease_id, call_id, instance_id, acquired_at, expires_at)
           VALUES (?, NULL, ?, ?, ?)`
        )
        .run(leaseId, instanceId, now.toISOString(), expires.toISOString());
      return { ok: true, leaseId };
    },
    { begin: 'IMMEDIATE' }
  )();
}

export const SQLITE_VAPI_SLOT_LEASES_DDL = `
CREATE TABLE IF NOT EXISTS vapi_slot_leases (
  lease_id TEXT PRIMARY KEY,
  call_id TEXT UNIQUE,
  instance_id TEXT NOT NULL,
  acquired_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  release_reason TEXT
);
CREATE INDEX IF NOT EXISTS vapi_slot_leases_expires_at_idx ON vapi_slot_leases (expires_at);
CREATE INDEX IF NOT EXISTS vapi_slot_leases_call_id_idx ON vapi_slot_leases (call_id);
`;
