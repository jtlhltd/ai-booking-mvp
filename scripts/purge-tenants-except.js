#!/usr/bin/env node
/**
 * Delete every tenant except the given --keep key, and remove related rows
 * that are not tied to tenants with ON DELETE CASCADE (e.g. opt_out_list).
 *
 * Usage:
 *   node scripts/purge-tenants-except.js --keep d2d-xpress-tom --confirm
 *
 * Optional:
 *   --dry-run   Only print which client_keys would be removed
 */
import 'dotenv/config';
import { init, query, deleteClient } from '../db.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const confirm = args.includes('--confirm');
const keepIdx = args.indexOf('--keep');
const keep =
  keepIdx >= 0 && args[keepIdx + 1] ? String(args[keepIdx + 1]).trim() : 'd2d-xpress-tom';

if (!keep) {
  console.error('Missing --keep <client_key>');
  process.exit(1);
}

/** Tables that use client_key (fixed list; unknown tables are skipped). */
const TABLES_WITH_CLIENT_KEY = [
  'rate_limit_tracking',
  'api_keys',
  'security_events',
  'user_accounts',
  'conversion_funnel',
  'performance_metrics',
  'ab_test_results',
  'ab_test_experiments',
  'analytics_events',
  'background_jobs',
  'dead_letter_queue',
  'cost_alerts',
  'budget_limits',
  'cost_tracking',
  'retry_queue',
  'call_queue',
  'quality_alerts',
  'call_schedule_decisions',
  'call_time_bandit_observations',
  'call_time_bandit',
  'call_insights',
  'outbound_weekday_journey',
  'outbound_dial_daily_claim',
  'calls',
  'crm_sync_failures',
  'crm_integrations',
  'idempotency',
  'messages',
  // Must run before DELETE FROM leads (FK from appointment_analytics.lead_id → leads.id, no CASCADE)
  'appointment_analytics',
  'appointment_funnel',
  'appointment_performance',
  'appointments',
  'leads',
  'lead_engagement',
  'objections',
  'client_goals'
];

async function safeDeleteFrom(table, clientKey) {
  try {
    await query(`DELETE FROM ${table} WHERE client_key = $1`, [clientKey]);
  } catch (e) {
    const msg = String(e?.message || e);
    if (/no such table|does not exist|relation .* does not exist/i.test(msg)) return;
    throw e;
  }
}

async function main() {
  await init();
  const { rows } = await query(
    `SELECT client_key FROM tenants WHERE client_key != $1 ORDER BY client_key`,
    [keep]
  );
  const keys = (rows || []).map((r) => r.client_key).filter(Boolean);
  if (!keys.length) {
    console.log('No tenants to remove (only', keep, 'present).');
    process.exit(0);
  }
  console.log('Will remove tenants:', keys.join(', '));
  if (dryRun) {
    console.log('Dry run — no changes.');
    process.exit(0);
  }
  if (!confirm) {
    console.error('Refusing to delete without --confirm (use --dry-run to preview).');
    process.exit(2);
  }

  for (const k of keys) {
    console.log('Purging:', k);
    for (const t of TABLES_WITH_CLIENT_KEY) {
      await safeDeleteFrom(t, k);
    }
    await query(`DELETE FROM opt_out_list WHERE client_key = $1`, [k]).catch(() => {});
    await query(`DELETE FROM referrals WHERE referrer_client_key = $1 OR referred_client_key = $1`, [
      k
    ]).catch(() => {});
    await deleteClient(k);
  }

  const left = await query(`SELECT client_key FROM tenants ORDER BY client_key`, []);
  console.log(
    'Remaining tenants:',
    (left.rows || []).map((r) => r.client_key).join(', ') || '(none)'
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
