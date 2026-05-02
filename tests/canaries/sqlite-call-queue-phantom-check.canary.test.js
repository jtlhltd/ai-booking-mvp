/**
 * Canary for Intent Contract: queue.no-phantom-completed (SQLite parity).
 *
 * Native better-sqlite3 is not required here: we assert the DDL + migration
 * stay present in db.js so CI cannot silently drop the SQLite guard.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test, expect } from '@jest/globals';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('canary: queue.no-phantom-completed', () => {
  test('db.js retains sqlite call_queue phantom CHECK and migrateSqliteCallQueuePhantomConstraint', () => {
    const dbJs = readFileSync(path.join(repoRoot, 'db.js'), 'utf8');
    expect(dbJs).toMatch(
      /CHECK \(status != 'completed' OR call_type != 'vapi_call' OR initiated_call_id IS NOT NULL\)/
    );
    expect(dbJs).toContain('migrateSqliteCallQueuePhantomConstraint');
    expect(dbJs).toContain('UPDATE call_queue');
    expect(dbJs).toContain('call_queue__phantom_mig');
  });
});
