#!/usr/bin/env node
/**
 * Test that the tenants query (listFullClients) is no longer slow.
 * Run: node scripts/test-tenant-query-perf.js
 * Requires: DATABASE_URL in .env
 */
import 'dotenv/config';
import { init, listFullClients } from '../db.js';

const CRITICAL_MS = 5000;  // same as query-performance-tracker
const SLOW_MS = 1000;

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL not set. Create a .env with DATABASE_URL.');
    process.exit(1);
  }

  console.log('Testing tenant query performance (listFullClients)...\n');
  await init();

  const start = Date.now();
  const clients = await listFullClients();
  const elapsed = Date.now() - start;

  console.log(`  listFullClients(): ${elapsed}ms, ${clients.length} tenant(s)`);
  console.log('');

  if (elapsed >= CRITICAL_MS) {
    console.error(`❌ FAIL: Query took ${elapsed}ms (critical threshold ${CRITICAL_MS}ms)`);
    process.exit(1);
  }
  if (elapsed >= SLOW_MS) {
    console.warn(`⚠️  WARN: Query took ${elapsed}ms (slow threshold ${SLOW_MS}ms)`);
  } else {
    console.log(`✅ PASS: Query completed in ${elapsed}ms (under ${SLOW_MS}ms)`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
