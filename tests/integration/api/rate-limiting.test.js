// tests/integration/api/rate-limiting.test.js
// Integration tests for rate limiting (in-process app + SQLite :memory:)

import { describe, test, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import {
  createOpsIntegrationApp,
  expectRateLimitStyleHeaders
} from '../../helpers/http-integration-app.js';

describe('Rate Limiting API', () => {
  let app;
  let dbModule;

  const prevDbType = process.env.DB_TYPE;
  const prevDatabaseUrl = process.env.DATABASE_URL;
  const prevDbPath = process.env.DB_PATH;

  beforeAll(async () => {
    jest.resetModules();
    process.env.DB_TYPE = '';
    process.env.DB_PATH = ':memory:';
    delete process.env.DATABASE_URL;

    dbModule = await import('../../../db.js');
    await dbModule.init();
    app = await createOpsIntegrationApp();
  });

  afterAll(async () => {
    try {
      const cache = await import('../../../lib/cache.js');
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

  const API_KEY = process.env.API_KEY || 'test-key';

  test('GET /api/rate-limit/status returns rate limit status', async () => {
    const response = await request(app)
      .get('/api/rate-limit/status')
      .set('X-API-Key', API_KEY);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('ok', true);
    expect(response.body).toHaveProperty('identifier');
    expect(response.body).toHaveProperty('limits');
    expect(response.body).toHaveProperty('systemStats');
  });

  test('Rate limit headers are present in responses', async () => {
    const response = await request(app)
      .get('/api/stats?clientKey=test')
      .set('X-API-Key', API_KEY);

    expect(response.status).toBe(200);
    expectRateLimitStyleHeaders(response);
  });
});
