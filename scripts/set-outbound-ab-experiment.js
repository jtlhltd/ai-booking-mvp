/**
 * Merge outboundAbExperiment into tenant vapi_json (Postgres JSONB || or JS merge fallback).
 *
 * Usage:
 *   node scripts/set-outbound-ab-experiment.js d2d-xpress-tom tom_outbound_v1
 */
import 'dotenv/config';
import { init, query, invalidateClientCache } from '../db.js';

const clientKey = process.argv[2] || 'd2d-xpress-tom';
const experimentName = (process.argv[3] || '').trim();

if (!experimentName) {
  console.error('Usage: node scripts/set-outbound-ab-experiment.js <client_key> <experiment_name>');
  process.exit(1);
}

await init();

const { rows } = await query('SELECT vapi_json FROM tenants WHERE client_key = $1', [clientKey]);
if (!rows?.length) {
  console.error('Tenant not found:', clientKey);
  process.exit(1);
}

let vapi = rows[0].vapi_json;
if (vapi == null) vapi = {};
if (typeof vapi === 'string') {
  try {
    vapi = JSON.parse(vapi);
  } catch {
    vapi = {};
  }
}
if (typeof vapi !== 'object' || Array.isArray(vapi)) vapi = {};

vapi.outboundAbExperiment = experimentName;

await query('UPDATE tenants SET vapi_json = $2 WHERE client_key = $1', [clientKey, JSON.stringify(vapi)]);

invalidateClientCache(clientKey);
console.log('✅ Updated', clientKey, 'vapi.outboundAbExperiment =', experimentName);
console.log('   Full vapi_json:', JSON.stringify(vapi, null, 2));
process.exit(0);
