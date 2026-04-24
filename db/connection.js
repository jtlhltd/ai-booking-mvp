import { Pool } from 'pg';
import { createQueryConcurrencyLimiter } from './query-concurrency-limiter.js';

/**
 * Resolve SSL option for node-pg from DATABASE_URL host (local vs remote).
 * @param {string} dbUrl
 * @param {NodeJS.ProcessEnv} [env]
 */
export function resolvePgSsl(dbUrl, env = process.env) {
  let pgSsl = { rejectUnauthorized: false };
  if (env.PG_FORCE_SSL !== '1') {
    try {
      const normalized = dbUrl.replace(/^postgres(ql)?:/i, 'http:');
      const u = new URL(normalized);
      if (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '::1') {
        pgSsl = false;
      }
    } catch {
      /* keep default ssl */
    }
  }
  return pgSsl;
}

/**
 * Create Postgres pool + optional query concurrency limiter (no network I/O).
 * @param {string} dbUrl
 * @param {NodeJS.ProcessEnv} [env]
 */
/**
 * Postgres `statement_timeout` (ms) per session. Heavy routes (e.g. /api/demo-dashboard) can exceed 20s on real data.
 * Render edge often returns HTML 502 if the origin is still busy — keep under proxy limits and tune this via env.
 */
export function resolveStatementTimeoutMs(env = process.env) {
  const raw = parseInt(env.DB_STATEMENT_TIMEOUT_MS, 10);
  if (Number.isFinite(raw) && raw >= 1000 && raw <= 300000) {
    return raw;
  }
  return env.RENDER === 'true' ? 60000 : 20000;
}

export function createPostgresPoolAndLimiter(dbUrl, env = process.env) {
  const rawMax = parseInt(env.DB_POOL_MAX, 10);
  const defaultPoolMax = env.RENDER === 'true' ? 12 : 25;
  const maxConnections =
    Number.isFinite(rawMax) && rawMax >= 2 ? Math.min(rawMax, 80) : defaultPoolMax;

  const pgSsl = resolvePgSsl(dbUrl, env);
  const statementTimeout = resolveStatementTimeoutMs(env);

  const pool = new Pool({
    connectionString: dbUrl,
    ssl: pgSsl,
    max: maxConnections,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 5000,
    statement_timeout: statementTimeout,
    allowExitOnIdle: true,
  });

  const rawQc = parseInt(env.DB_QUERY_CONCURRENCY, 10);
  let queryConc;
  if (rawQc === 0) {
    queryConc = null;
  } else if (Number.isFinite(rawQc) && rawQc > 0) {
    queryConc = Math.min(rawQc, maxConnections);
  } else if (env.RENDER === 'true') {
    queryConc = Math.min(8, maxConnections);
  } else {
    queryConc = null;
  }
  const pgQueryLimiter = queryConc ? createQueryConcurrencyLimiter(queryConc) : null;

  return { pool, pgQueryLimiter, maxConnections, queryConc };
}

/**
 * Smoke-test pool connectivity (same semantics as legacy db.js init).
 * @param {import('pg').Pool} pool
 * @param {number} [timeoutMs]
 */
export async function testPostgresPoolConnection(pool, timeoutMs = 10000) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error(`Connection timeout after ${timeoutMs / 1000} seconds`)),
      timeoutMs,
    );
    if (typeof timeoutId?.unref === 'function') timeoutId.unref();
  });
  try {
    await Promise.race([pool.query('SELECT 1'), timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
}
