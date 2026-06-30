#!/usr/bin/env node
/**
 * Pause all outbound dials for a tenant (Option B ops runbook).
 * Usage: node scripts/pause-tenant-outbound.mjs d2d-xpress-tom
 */
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const clientKey = String(process.argv[2] || 'd2d-xpress-tom').trim();
if (!clientKey) {
  console.error('Usage: node scripts/pause-tenant-outbound.mjs <clientKey>');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('render.com') ? { rejectUnauthorized: false } : undefined,
});

async function count(label, sql, params = []) {
  const { rows } = await pool.query(sql, params);
  console.log(`${label}:`, rows[0]);
}

try {
  await count(
    'before tenant',
    `SELECT client_key, is_enabled, outbound_sequence_json->>'enabled' AS sequence_enabled
     FROM tenants WHERE client_key = $1`,
    [clientKey]
  );
  await count(
    'before queue',
    `SELECT COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
            COUNT(*) FILTER (WHERE status = 'processing')::int AS processing
     FROM call_queue WHERE client_key = $1 AND call_type = 'vapi_call'`,
    [clientKey]
  );
  await count(
    'before retries',
    `SELECT COUNT(*) FILTER (WHERE status IN ('pending', 'processing'))::int AS active
     FROM retry_queue WHERE client_key = $1`,
    [clientKey]
  );

  const tenant = await pool.query(
    `
    UPDATE tenants
    SET is_enabled = false,
        outbound_sequence_json = jsonb_set(
          COALESCE(outbound_sequence_json, '{}'::jsonb),
          '{enabled}',
          'false'::jsonb,
          true
        )
    WHERE client_key = $1
    RETURNING client_key, is_enabled, outbound_sequence_json->>'enabled' AS sequence_enabled
    `,
    [clientKey]
  );

  const delPending = await pool.query(
    `DELETE FROM call_queue WHERE client_key = $1 AND status = 'pending'`,
    [clientKey]
  );
  const cancelQueue = await pool.query(
    `
    UPDATE call_queue
    SET status = 'cancelled', updated_at = NOW()
    WHERE client_key = $1 AND call_type = 'vapi_call' AND status = 'processing'
    `,
    [clientKey]
  );
  const cancelRetries = await pool.query(
    `
    UPDATE retry_queue
    SET status = 'cancelled', updated_at = NOW()
    WHERE client_key = $1 AND status IN ('pending', 'processing')
    `,
    [clientKey]
  );

  console.log('tenant updated:', tenant.rows[0] || null);
  console.log('pending deleted:', delPending.rowCount);
  console.log('processing cancelled:', cancelQueue.rowCount);
  console.log('retries cancelled:', cancelRetries.rowCount);

  await count(
    'after queue',
    `SELECT COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
            COUNT(*) FILTER (WHERE status = 'processing')::int AS processing
     FROM call_queue WHERE client_key = $1 AND call_type = 'vapi_call'`,
    [clientKey]
  );
  await count(
    'after retries',
    `SELECT COUNT(*) FILTER (WHERE status IN ('pending', 'processing'))::int AS active
     FROM retry_queue WHERE client_key = $1`,
    [clientKey]
  );
} finally {
  await pool.end();
}
