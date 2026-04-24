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
});

