// tests/integration/api/query-performance.test.js
// Integration tests for query performance endpoints (in-process app + SQLite :memory:)

import { describe, test, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import { createOpsIntegrationApp } from '../../helpers/http-integration-app.js';

describe('Query Performance API', () => {
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

  test('GET /api/performance/queries/slow returns slow queries', async () => {
    const response = await request(app)
      .get('/api/performance/queries/slow?limit=10')
      .set('X-API-Key', API_KEY);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('ok', true);
    expect(response.body).toHaveProperty('slowQueries');
    expect(Array.isArray(response.body.slowQueries)).toBe(true);
  });

  test('GET /api/performance/queries/stats returns statistics', async () => {
    const response = await request(app)
      .get('/api/performance/queries/stats')
      .set('X-API-Key', API_KEY);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('ok', true);
    expect(response.body).toHaveProperty('stats');
    expect(response.body.stats).toHaveProperty('totalQueries');
  });

  test('GET /api/performance/queries/recommendations returns recommendations', async () => {
    const response = await request(app)
      .get('/api/performance/queries/recommendations')
      .set('X-API-Key', API_KEY);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('ok', true);
    expect(response.body).toHaveProperty('recommendations');
    expect(Array.isArray(response.body.recommendations)).toBe(true);
  });
});
