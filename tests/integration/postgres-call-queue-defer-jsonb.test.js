/**
 * Postgres: queue deferral JSON must not hit "could not determine data type of parameter"
 * when statusCode/details are null. Requires TEST_DATABASE_URL + RUN_POSTGRES_SMOKE_TESTS=1.
 */
import { describe, test, expect, beforeAll, afterAll, jest } from '@jest/globals';

jest.setTimeout(60000);

const run =
  process.env.RUN_POSTGRES_SMOKE_TESTS === '1' || process.env.RUN_DB_INTEGRATION_TESTS === '1';

(run ? describe : describe.skip)('Postgres: call_queue lastDefer jsonb typing', () => {
  let dbModule;
  const prevDbType = process.env.DB_TYPE;
  const prevDatabaseUrl = process.env.DATABASE_URL;
  const prevDbPath = process.env.DB_PATH;

  beforeAll(async () => {
    const pgUrl = process.env.TEST_DATABASE_URL;
    if (!pgUrl) {
      throw new Error('TEST_DATABASE_URL is required for this test (CI sets it).');
    }
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

  test('jsonb_set lastDefer accepts null statusCode and null details', async () => {
    const clientKey = `pg_defer_${Date.now()}`;
    await dbModule.query(
      `INSERT INTO tenants (client_key, display_name) VALUES ($1, $2) ON CONFLICT (client_key) DO NOTHING`,
      [clientKey, 'Pg defer jsonb test']
    );
    const ins = await dbModule.query(
      `
      INSERT INTO call_queue (client_key, lead_phone, status, scheduled_for, call_type, call_data)
      VALUES ($1, $2, 'pending', NOW(), 'vapi_call', '{}'::jsonb)
      RETURNING id
    `,
      [clientKey, '+447700900999']
    );
    const id = ins.rows[0].id;
    const next = new Date(Date.now() + 120_000).toISOString();
    await expect(
      dbModule.query(
        `
        UPDATE call_queue
        SET status = 'pending',
            scheduled_for = $1::timestamptz,
            call_data = jsonb_set(
              COALESCE(call_data, '{}'::jsonb),
              '{lastDefer}',
              jsonb_build_object(
                'at', NOW(),
                'kind', 'vapi',
                'error', $3::text,
                'statusCode', $4::integer,
                'details', $5::text
              ),
              true
            ),
            updated_at = NOW()
        WHERE id = $2
      `,
        [next, id, 'transient_test', null, null]
      )
    ).resolves.toBeTruthy();

    await dbModule.query(`DELETE FROM call_queue WHERE id = $1`, [id]);
    await dbModule.query(`DELETE FROM tenants WHERE client_key = $1`, [clientKey]);
  });
});
