#!/usr/bin/env node
/**
 * Test the "87 calls from 10 leads" and "Call.start.error get customer" fixes:
 * 1. Run instant-calling tests (empty phone validation).
 * 2. Print manual test steps for queue + failed-call recording.
 *
 * Usage: node scripts/test-queue-and-failed-calls.js
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

async function runTests() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'node',
      ['tests/lib/test-instant-calling.js'],
      { cwd: projectRoot, stdio: 'inherit', shell: true }
    );
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`Tests exited with ${code}`))));
  });
}

function printManualSteps() {
  console.log(`
================================================================================
MANUAL TEST STEPS (queue + failed-call recording)
================================================================================

1) Automated tests (just run)
   node scripts/test-queue-and-failed-calls.js
   or
   node tests/lib/test-instant-calling.js
   Expect: "callLeadInstantly rejects missing/empty lead phone" and
           "callLeadInstantly rejects null/whitespace lead phone" to pass.

2) Local / Render: verify no re-queue storm
   - Add 1–2 leads (or use 10) for a tenant that has VAPI configured.
   - If VAPI still fails with "Call.start.error get customer", you should see:
     • Only 1 attempt per lead (+ up to 3 queue retries), not 80+.
     • In DB: calls table has rows with status = 'failed' for those leads.
     • After 5 min, lead queuer should NOT queue the same leads again
       (they already have a 'failed' call).
   - Check Render logs for:
     [QUEUE VAPI CALL ERROR] ... then
     [QUEUE VAPI CALL] Failed to record failed attempt (only if DB write failed)
     or no re-queue of same lead on next [LEAD QUEUER] run.

3) Optional: force a failed attempt locally
   - In processVapiCallFromQueue, the code now calls upsertCall with
     status: 'failed' when callLeadInstantly returns !ok.
   - You can temporarily mock callLeadInstantly to return { ok: false }
     and run the call queue processor; then check that a 'failed' row
     exists and that queueNewLeadsForCalling no longer picks that lead.

4) Customer number validation
   - In Render logs, after deploy, look for:
     [INSTANT CALL] Lead phone missing or empty  (if phone was blank)
     [INSTANT CALL] Lead phone may not be E.164  (if format is wrong)
   - If you see neither and calls still fail with "get customer", the
     cause is likely VAPI assistant config or carrier/VAPI side.

================================================================================
`);
}

async function main() {
  console.log('Running instant-calling tests (including empty-phone validation)...\n');
  try {
    await runTests();
    console.log('\nTests passed.\n');
  } catch (e) {
    console.error('\nTests failed:', e.message);
    process.exit(1);
  }
  printManualSteps();
}

main();
