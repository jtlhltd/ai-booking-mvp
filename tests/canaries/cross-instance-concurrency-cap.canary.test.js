/**
 * Canary for Intent Contract: queue.cross-instance-concurrency-cap
 *
 * Two logical instance_ids sharing one SQLite DB must not exceed VAPI_MAX_CONCURRENT
 * active lease rows (expires_at in the future). Uses the same DDL as production SQLite.
 *
 * Skips the whole describe when better-sqlite3 native bindings are unavailable
 * (common on Windows dev trees until `npm rebuild better-sqlite3`); CI/Linux runs them.
 */
import { describe, expect, test, afterEach } from '@jest/globals';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
let MemoryDatabase = null;
try {
  const Database = require('better-sqlite3');
  const probe = new Database(':memory:');
  probe.close();
  MemoryDatabase = Database;
} catch {
  MemoryDatabase = null;
}

const describeCanary = MemoryDatabase ? describe : describe.skip;

afterEach(() => {
  delete process.env.VAPI_MAX_CONCURRENT;
});

describeCanary('canary: queue.cross-instance-concurrency-cap', () => {
  test('two instance ids respect global cap on shared sqlite db', async () => {
    process.env.VAPI_MAX_CONCURRENT = '1';
    const { SQLITE_VAPI_SLOT_LEASES_DDL, tryAcquireLeaseOnSqliteDb } = await import('../../lib/vapi-slot-lease.js');
    const db = new MemoryDatabase(':memory:');
    db.exec(SQLITE_VAPI_SLOT_LEASES_DDL);

    const a = tryAcquireLeaseOnSqliteDb(db, 'inst-a');
    expect(a.ok).toBe(true);
    const b = tryAcquireLeaseOnSqliteDb(db, 'inst-b');
    expect(b.ok).toBe(false);

    db.prepare('DELETE FROM vapi_slot_leases WHERE lease_id = ?').run(a.leaseId);
    const c = tryAcquireLeaseOnSqliteDb(db, 'inst-b');
    expect(c.ok).toBe(true);
    db.close();
  });

  test('expired lease does not count toward cap', async () => {
    process.env.VAPI_MAX_CONCURRENT = '1';
    const { SQLITE_VAPI_SLOT_LEASES_DDL, tryAcquireLeaseOnSqliteDb } = await import('../../lib/vapi-slot-lease.js');
    const db = new MemoryDatabase(':memory:');
    db.exec(SQLITE_VAPI_SLOT_LEASES_DDL);
    const past = new Date(Date.now() - 60_000).toISOString();
    db.prepare(
      `INSERT INTO vapi_slot_leases (lease_id, call_id, instance_id, acquired_at, expires_at)
       VALUES ('dead-lease', NULL, 'ghost', datetime('now'), ?)`
    ).run(past);

    const x = tryAcquireLeaseOnSqliteDb(db, 'inst-x');
    expect(x.ok).toBe(true);
    db.close();
  });
});
