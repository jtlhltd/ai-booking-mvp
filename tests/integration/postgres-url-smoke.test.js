/**
 * Optional: set TEST_DATABASE_URL (e.g. via .env.test from `npm run env:test`)
 * to verify Postgres connectivity used by booking-related code paths.
 */
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import pg from 'pg';

/** Require explicit opt-in so CI/local .env.test URLs do not flake the default test run. */
const url = process.env.TEST_DATABASE_URL;
const run = Boolean(url && String(url).trim() && process.env.RUN_POSTGRES_SMOKE_TESTS === '1');

(run ? describe : describe.skip)('Postgres TEST_DATABASE_URL smoke', () => {
  let client;

  beforeAll(async () => {
    const parsed = new URL(url);
    const isLocalhost =
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '::1';

    const connectOnce = async (useSsl) => {
      client = new pg.Client({
        connectionString: url,
        ssl: useSsl ? { rejectUnauthorized: false } : undefined,
      });
      await client.connect();
    };

    try {
      await connectOnce(!isLocalhost);
    } catch (err) {
      const msg = String(err?.message || err);
      if (msg.includes('SSL/TLS required')) {
        await client?.end().catch(() => {});
        await connectOnce(true);
        return;
      }
      if (msg.includes('does not support SSL connections')) {
        await client?.end().catch(() => {});
        await connectOnce(false);
        return;
      }
      throw err;
    }
  });

  afterAll(async () => {
    if (client) await client.end().catch(() => {});
  });

  test('runs SELECT 1', async () => {
    const { rows } = await client.query('SELECT 1 AS ok');
    expect(rows[0].ok).toBe(1);
  });
});
