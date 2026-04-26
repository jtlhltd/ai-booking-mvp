import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';

beforeEach(() => {
  jest.resetModules();
});

describe('routes/call-insights-mount', () => {
  test('failure: GET /api/call-quality/:clientKey returns 500 when poolQuerySelect throws', async () => {
    const { createCallInsightsRouter } = await import('../../routes/call-insights-mount.js');
    const app = express();
    app.use(
      '/api',
      createCallInsightsRouter({
        cacheMiddleware: () => (_req, _res, next) => next(),
        poolQuerySelect: async () => {
          throw new Error('db_down');
        },
        query: async () => ({ rows: [] }),
      }),
    );
    const res = await request(app).get('/api/call-quality/c1');
    expect(res.status).toBe(500);
    expect(res.body).toEqual(expect.objectContaining({ ok: false }));
  });

  test('happy: GET /api/call-insights/:clientKey returns ok true (mocked engine)', async () => {
    jest.unstable_mockModule('../../db.js', () => ({
      getLatestCallInsights: jest.fn(async () => null),
      upsertCallInsights: jest.fn(async () => ({})),
      getFullClient: jest.fn(async () => ({ timezone: 'Europe/London' })),
      getCallAnalyticsFloorIso: jest.fn(async () => '2020-01-01T00:00:00.000Z'),
    }));
    jest.unstable_mockModule('../../lib/call-insights-engine.js', () => ({
      computeAndStoreCallInsights: jest.fn(async () => ({ insights: { ok: true }, routing: { howCalculated: {} } })),
    }));

    const { createCallInsightsRouter } = await import('../../routes/call-insights-mount.js');
    const app = express();
    app.use(express.json());
    app.use(
      '/api',
      createCallInsightsRouter({
        cacheMiddleware: () => (_req, _res, next) => next(),
        poolQuerySelect: async () => ({ rows: [] }),
        query: async () => ({ rows: [] }),
      }),
    );
    const res = await request(app).get('/api/call-insights/c1').expect(200);
    expect(res.body).toEqual(expect.objectContaining({ ok: true, source: expect.any(String) }));
  });
});

