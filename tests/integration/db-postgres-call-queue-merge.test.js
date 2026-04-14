/**
 * Requires TEST_DATABASE_URL (Postgres). Skipped in CI when unset.
 * Dynamic import after env so db.js picks up DB_TYPE=postgres.
 */
import { describe, test, expect, beforeAll, afterAll, jest } from '@jest/globals';

const pgUrl = process.env.TEST_DATABASE_URL;
const describePg = pgUrl ? describe : describe.skip;

describePg('Postgres: addToCallQueue vapi_call merge', () => {
  let dbModule;
  const prevDbType = process.env.DB_TYPE;
  const prevDatabaseUrl = process.env.DATABASE_URL;
  const prevDbPath = process.env.DB_PATH;

  beforeAll(async () => {
    jest.resetModules();
    process.env.DB_TYPE = 'postgres';
    process.env.DATABASE_URL = pgUrl;
    delete process.env.DB_PATH;
    dbModule = await import('../../db.js');
    await dbModule.init();
  });

  afterAll(async () => {
    try {
      const cache = await import('../../lib/cache.js');
      await cache.disconnectRedisClient();
    } catch (_) {
      /* ignore */
    }
    try {
      await dbModule?.closeDatabaseConnectionsForTests?.();
    } catch (_) {
      /* ignore */
    }
    if (prevDbType === undefined) delete process.env.DB_TYPE;
    else process.env.DB_TYPE = prevDbType;
    if (prevDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = prevDatabaseUrl;
    if (prevDbPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = prevDbPath;
    jest.resetModules();
  });

  test('merges duplicate vapi_call queue rows by digit key', async () => {
    const clientKey = `pg_merge_${Date.now()}`;
    await dbModule.query(
      `INSERT INTO tenants (client_key, display_name) VALUES ($1, $2) ON CONFLICT (client_key) DO NOTHING`,
      [clientKey, 'Pg merge test']
    );
    const past = new Date(Date.now() - 120_000);
    const r1 = await dbModule.addToCallQueue({
      clientKey,
      leadPhone: '+447700900888',
      priority: 5,
      scheduledFor: past,
      callType: 'vapi_call',
      callData: {}
    });
    const r2 = await dbModule.addToCallQueue({
      clientKey,
      leadPhone: '07700 900 888',
      priority: 3,
      scheduledFor: new Date(),
      callType: 'vapi_call',
      callData: {}
    });
    expect(r2.id).toBe(r1.id);
    expect(Number(r2.priority)).toBe(3);
    const { rows } = await dbModule.query(`SELECT COUNT(*)::int AS n FROM call_queue WHERE client_key = $1`, [clientKey]);
    expect(Number(rows[0].n)).toBe(1);
    await dbModule.query(`DELETE FROM call_queue WHERE client_key = $1`, [clientKey]);
    await dbModule.query(`DELETE FROM tenants WHERE client_key = $1`, [clientKey]);
  });
});
