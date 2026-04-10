#!/usr/bin/env node
/**
 * Inspect outbound A/B state for a tenant: vapi_json experiment slots + ab_test_experiments rows.
 *
 * Usage:
 *   node scripts/inspect-outbound-ab-experiments.js <client_key>
 */
import 'dotenv/config';
import { init, query, inferOutboundAbBundleTriple } from '../db.js';

const clientKey = (process.argv[2] || '').trim();
if (!clientKey) {
  console.error('Usage: node scripts/inspect-outbound-ab-experiments.js <client_key>');
  process.exit(1);
}

await init();

const tenant = await query('SELECT vapi_json FROM tenants WHERE client_key = $1', [clientKey]);
if (!tenant.rows?.length) {
  console.error('Tenant not found:', clientKey);
  process.exit(1);
}

let vapi = tenant.rows[0].vapi_json;
if (vapi == null) vapi = {};
if (typeof vapi === 'string') {
  try {
    vapi = JSON.parse(vapi);
  } catch {
    vapi = {};
  }
}

console.log(`\nOutbound A/B — ${clientKey}\n`);
console.log('—'.repeat(72));
console.log('\nvapi_json outbound slots (what dashboard / dialer use):\n');
const keys = [
  'outboundAbVoiceExperiment',
  'outboundAbOpeningExperiment',
  'outboundAbScriptExperiment',
  'outboundAbExperiment',
  'outboundAbFocusDimension',
  'outboundAbBundlePhase',
  'outboundAbBundleAt',
  'outboundAbReviewPending'
];
for (const k of keys) {
  const v = vapi[k];
  const s = v != null && String(v).trim() !== '' ? String(v) : '—';
  console.log(`  ${k}: ${s}`);
}

const { rows: expRows } = await query(
  `
  SELECT experiment_name, variant_name, is_active, created_at,
         variant_config
  FROM ab_test_experiments
  WHERE client_key = $1
  ORDER BY experiment_name ASC, variant_name ASC, created_at ASC
  `,
  [clientKey]
);

console.log('\n' + '—'.repeat(72));
console.log(`\nab_test_experiments (${expRows.length} row(s)):\n`);

if (!expRows.length) {
  console.log('  (no rows)\n');
} else {
  const byName = new Map();
  for (const r of expRows) {
    const n = r.experiment_name != null ? String(r.experiment_name) : '';
    if (!byName.has(n)) byName.set(n, []);
    byName.get(n).push(r);
  }
  for (const [name, list] of [...byName.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const active = list.some((x) => x.is_active === true || x.is_active === 1);
    console.log(`  ${name}  [${active ? 'ACTIVE' : 'inactive'}]`);
    for (const r of list) {
      const cfg = r.variant_config;
      const cfgHint =
        cfg && typeof cfg === 'object'
          ? JSON.stringify(cfg).slice(0, 120) + (JSON.stringify(cfg).length > 120 ? '…' : '')
          : String(cfg || '').slice(0, 120);
      const act = r.is_active === true || r.is_active === 1 ? 'Y' : 'n';
      console.log(
        `    · ${r.variant_name}  active=${act}  created=${r.created_at != null ? r.created_at : '—'}`
      );
      console.log(`      config: ${cfgHint || '—'}`);
    }
    console.log('');
  }
}

try {
  const triple = await inferOutboundAbBundleTriple(clientKey);
  console.log('—'.repeat(72));
  console.log('\ninferOutboundAbBundleTriple() (active bundle stem, newest first):\n');
  if (triple) {
    console.log('  voice:   ', triple.voice);
    console.log('  opening: ', triple.opening);
    console.log('  script:  ', triple.script);
  } else {
    console.log('  (no complete ab_b_* _voice + _open + _script triple with all active)\n');
  }
} catch (e) {
  console.log('\n(inferOutboundAbBundleTriple failed:', e?.message || e, ')\n');
}

process.exit(0);
