#!/usr/bin/env node
/**
 * Opt-in production smoke for Tom cutover.
 * Usage: SMOKE=1 node scripts/smoke/tom-cutover-smoke.mjs
 */
import 'dotenv/config';
import crypto from 'crypto';
import pg from 'pg';

if (process.env.SMOKE !== '1') {
  console.log('[smoke] Set SMOKE=1 to run tom-cutover-smoke.mjs');
  process.exit(0);
}

const TOM_WEBHOOK_URL = process.env.TOM_WEBHOOK_URL ||
  'https://d2d-xpress-app-f02w.onrender.com/webhooks/callbot';
const TENANT = process.env.TENANT_CLIENT_KEY || 'd2d-xpress-tom';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost')
    ? false
    : { rejectUnauthorized: false },
});

const { rows } = await pool.query(
  `SELECT consumer_webhook_json->>'secret' AS secret FROM tenants WHERE client_key = $1 LIMIT 1`,
  [TENANT]
);
const secret = rows[0]?.secret;
await pool.end();

if (!secret) {
  console.error('[smoke] FAIL: no consumer webhook secret for tenant');
  process.exit(1);
}

const callId = `smoke-${Date.now()}`;
const body = JSON.stringify({
  id: `evt_smoke_${Date.now()}`,
  type: 'call.completed',
  apiVersion: '2026-06-30',
  createdAt: new Date().toISOString(),
  tenant: { displayName: 'D2D Xpress' },
  data: {
    call: { id: callId, leadPhone: '+447700900999', leadName: 'Smoke Test Co' },
    qualification: {
      summary: 'post-cutover smoke',
      fields: {
        transcript:
          'User: We ship about ten pallets per week from London to Manchester using DPD mostly. Manager asked for a callback tomorrow.',
      },
    },
    links: {},
  },
});
const ts = String(Math.floor(Date.now() / 1000));
const sig = crypto.createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');

const res = await fetch(TOM_WEBHOOK_URL, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-CallBot-Timestamp': ts,
    'X-CallBot-Signature': sig,
  },
  body,
});
const text = await res.text();
console.log('[smoke] webhook', res.status, text.slice(0, 400));
console.log('[smoke] callId', callId);

if (!res.ok) process.exit(1);
