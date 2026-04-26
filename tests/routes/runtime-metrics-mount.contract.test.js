import { describe, test, expect } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { DateTime } from 'luxon';
import { createRuntimeMetricsRouter } from '../../routes/runtime-metrics-mount.js';

describe('routes/runtime-metrics-mount', () => {
  test('happy: GET /api/build returns ok true', async () => {
    const app = express();
    app.use(
      createRuntimeMetricsRouter({
        query: async () => ({ rows: [] }),
        listFullClients: async () => [],
        getFullClient: async () => null,
        cacheMiddleware: () => (_req, _res, next) => next(),
        dashboardStatsCache: new Map(),
        DASHBOARD_CACHE_TTL: 1000,
        AIInsightsEngine: class {},
        getClientFromHeader: async () => null,
        pickTimezone: () => 'UTC',
        DateTime,
        getCallContextCacheStats: () => ({}),
        getMostRecentCallContext: () => null,
        GOOGLE_CLIENT_EMAIL: null,
        GOOGLE_PRIVATE_KEY: null,
        GOOGLE_CALENDAR_ID: null,
      }),
    );
    const res = await request(app).get('/api/build').expect(200);
    expect(res.body).toEqual(expect.objectContaining({ ok: true }));
  });

  test('failure: GET /api/health/detailed marks database unhealthy when SELECT fails', async () => {
    const app = express();
    app.use(
      createRuntimeMetricsRouter({
        query: async (sql) => {
          if (String(sql).includes('SELECT 1')) throw new Error('db_down');
          return { rows: [] };
        },
        listFullClients: async () => [],
        getFullClient: async () => null,
        cacheMiddleware: () => (_req, _res, next) => next(),
        dashboardStatsCache: new Map(),
        DASHBOARD_CACHE_TTL: 1000,
        AIInsightsEngine: class {},
        getClientFromHeader: async () => null,
        pickTimezone: () => 'UTC',
        DateTime,
        getCallContextCacheStats: () => ({}),
        getMostRecentCallContext: () => null,
        GOOGLE_CLIENT_EMAIL: null,
        GOOGLE_PRIVATE_KEY: null,
        GOOGLE_CALENDAR_ID: null,
      }),
    );
    const res = await request(app).get('/api/health/detailed').expect(200);
    expect(res.body.services.database.status).toBe('unhealthy');
    expect(res.body.services.database.error).toMatch(/db_down/);
  });

  test('failure: GET /monitor/sms-delivery returns 401 without api key', async () => {
    const app = express();
    app.use(
      createRuntimeMetricsRouter({
        query: async () => ({ rows: [] }),
        listFullClients: async () => [],
        getFullClient: async () => null,
        cacheMiddleware: () => (_req, _res, next) => next(),
        dashboardStatsCache: new Map(),
        DASHBOARD_CACHE_TTL: 1000,
        AIInsightsEngine: class {},
        getClientFromHeader: async () => null,
        pickTimezone: () => 'UTC',
        DateTime,
        getCallContextCacheStats: () => ({}),
        getMostRecentCallContext: () => null,
        GOOGLE_CLIENT_EMAIL: null,
        GOOGLE_PRIVATE_KEY: null,
        GOOGLE_CALENDAR_ID: null,
      }),
    );
    await request(app).get('/monitor/sms-delivery').expect(401);
  });

  test('failure: GET /monitor/tenant-resolution returns 401 without api key', async () => {
    const app = express();
    app.use(
      createRuntimeMetricsRouter({
        query: async () => ({ rows: [] }),
        listFullClients: async () => [],
        getFullClient: async () => null,
        cacheMiddleware: () => (_req, _res, next) => next(),
        dashboardStatsCache: new Map(),
        DASHBOARD_CACHE_TTL: 1000,
        AIInsightsEngine: class {},
        getClientFromHeader: async () => null,
        pickTimezone: () => 'UTC',
        DateTime,
        getCallContextCacheStats: () => ({}),
        getMostRecentCallContext: () => null,
        GOOGLE_CLIENT_EMAIL: null,
        GOOGLE_PRIVATE_KEY: null,
        GOOGLE_CALENDAR_ID: null,
      }),
    );
    await request(app).get('/monitor/tenant-resolution').expect(401);
  });

  test('failure: GET /api/time/now returns 400 when tenant unknown', async () => {
    const app = express();
    app.use(
      createRuntimeMetricsRouter({
        query: async () => ({ rows: [] }),
        listFullClients: async () => [],
        getFullClient: async () => null,
        cacheMiddleware: () => (_req, _res, next) => next(),
        dashboardStatsCache: new Map(),
        DASHBOARD_CACHE_TTL: 1000,
        AIInsightsEngine: class {},
        getClientFromHeader: async () => null,
        pickTimezone: () => 'UTC',
        DateTime,
        getCallContextCacheStats: () => ({}),
        getMostRecentCallContext: () => null,
        GOOGLE_CLIENT_EMAIL: null,
        GOOGLE_PRIVATE_KEY: null,
        GOOGLE_CALENDAR_ID: null,
      }),
    );
    const res = await request(app).get('/api/time/now').expect(400);
    expect(res.body).toEqual(expect.objectContaining({ ok: false, error: 'Unknown tenant' }));
  });

  test('happy: GET /api/time/now returns tenant clock payload', async () => {
    const app = express();
    app.use(
      createRuntimeMetricsRouter({
        query: async () => ({ rows: [] }),
        listFullClients: async () => [],
        getFullClient: async () => null,
        cacheMiddleware: () => (_req, _res, next) => next(),
        dashboardStatsCache: new Map(),
        DASHBOARD_CACHE_TTL: 1000,
        AIInsightsEngine: class {},
        getClientFromHeader: async () => ({ clientKey: 'acme' }),
        pickTimezone: () => 'Europe/London',
        DateTime,
        getCallContextCacheStats: () => ({}),
        getMostRecentCallContext: () => null,
        GOOGLE_CLIENT_EMAIL: null,
        GOOGLE_PRIVATE_KEY: null,
        GOOGLE_CALENDAR_ID: null,
      }),
    );
    const res = await request(app).get('/api/time/now').expect(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.tenant).toBe('acme');
    expect(res.body.timezone).toBe('Europe/London');
    expect(res.body.now?.iso).toBeTruthy();
  });

  test('happy: GET /api/debug/cache returns stats envelope', async () => {
    const app = express();
    app.use(
      createRuntimeMetricsRouter({
        query: async () => ({ rows: [] }),
        listFullClients: async () => [],
        getFullClient: async () => null,
        cacheMiddleware: () => (_req, _res, next) => next(),
        dashboardStatsCache: new Map(),
        DASHBOARD_CACHE_TTL: 1000,
        AIInsightsEngine: class {},
        getClientFromHeader: async () => null,
        pickTimezone: () => 'UTC',
        DateTime,
        getCallContextCacheStats: () => ({ size: 2 }),
        getMostRecentCallContext: () => ({ id: 'x' }),
        GOOGLE_CLIENT_EMAIL: null,
        GOOGLE_PRIVATE_KEY: null,
        GOOGLE_CALENDAR_ID: null,
      }),
    );
    const res = await request(app).get('/api/debug/cache').expect(200);
    expect(res.body.stats).toEqual({ size: 2 });
    expect(res.body.recentForLogisticsClient).toEqual({ id: 'x' });
  });

  test('failure: GET /api/insights/:clientKey returns 404 when client missing', async () => {
    const app = express();
    app.use(
      createRuntimeMetricsRouter({
        query: async () => ({ rows: [] }),
        listFullClients: async () => [],
        getFullClient: async () => null,
        cacheMiddleware: () => (_req, _res, next) => next(),
        dashboardStatsCache: new Map(),
        DASHBOARD_CACHE_TTL: 1000,
        AIInsightsEngine: class {
          async generateInsightsFromDB() {
            return [];
          }
        },
        getClientFromHeader: async () => null,
        pickTimezone: () => 'UTC',
        DateTime,
        getCallContextCacheStats: () => ({}),
        getMostRecentCallContext: () => null,
        GOOGLE_CLIENT_EMAIL: null,
        GOOGLE_PRIVATE_KEY: null,
        GOOGLE_CALENDAR_ID: null,
      }),
    );
    const res = await request(app).get('/api/insights/missing').expect(404);
    expect(res.body).toEqual(expect.objectContaining({ ok: false, error: 'Client not found' }));
  });

  test('failure: GET /api/realtime/stats returns 401 without api key', async () => {
    const app = express();
    app.use(
      createRuntimeMetricsRouter({
        query: async () => ({ rows: [] }),
        listFullClients: async () => [],
        getFullClient: async () => null,
        cacheMiddleware: () => (_req, _res, next) => next(),
        dashboardStatsCache: new Map(),
        DASHBOARD_CACHE_TTL: 1000,
        AIInsightsEngine: class {},
        getClientFromHeader: async () => null,
        pickTimezone: () => 'UTC',
        DateTime,
        getCallContextCacheStats: () => ({}),
        getMostRecentCallContext: () => null,
        GOOGLE_CLIENT_EMAIL: null,
        GOOGLE_PRIVATE_KEY: null,
        GOOGLE_CALENDAR_ID: null,
      }),
    );
    await request(app).get('/api/realtime/stats').expect(401);
  });

  test('happy: GET /monitor/tenant-resolution returns 200 with api key', async () => {
    const prev = process.env.API_KEY;
    process.env.API_KEY = 'secret';
    try {
      const app = express();
      app.use(
        createRuntimeMetricsRouter({
          query: async () => ({ rows: [] }),
          listFullClients: async () => [],
          getFullClient: async () => null,
          cacheMiddleware: () => (_req, _res, next) => next(),
          dashboardStatsCache: new Map(),
          DASHBOARD_CACHE_TTL: 1000,
          AIInsightsEngine: class {},
          getClientFromHeader: async () => null,
          pickTimezone: () => 'UTC',
          DateTime,
          getCallContextCacheStats: () => ({}),
          getMostRecentCallContext: () => null,
          GOOGLE_CLIENT_EMAIL: null,
          GOOGLE_PRIVATE_KEY: null,
          GOOGLE_CALENDAR_ID: null,
        }),
      );
      const res = await request(app).get('/monitor/tenant-resolution').set('X-API-Key', 'secret');
      expect(res.status).toBe(200);
      expect(res.body).toEqual(
        expect.objectContaining({ totalTenants: 0, tenantsWithSms: 0, tenantsWithMessagingService: 0 }),
      );
    } finally {
      if (prev === undefined) delete process.env.API_KEY;
      else process.env.API_KEY = prev;
    }
  });
});

