import { describe, test, expect } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createAdminAnalyticsRouter, createAdminCostAndAccessRouter } from '../../routes/admin-analytics-mount.js';

describe('routes/admin-analytics-mount', () => {
  test('401 without X-API-Key', async () => {
    const app = express();
    app.use(express.json());
    app.use(
      createAdminAnalyticsRouter({
        getApiKey: () => 'secret',
        getAnalyticsDashboard: async () => ({ summary: { totalLeads: 0, conversionRate: 0 } }),
        generateAnalyticsReport: async () => ({}),
        trackAnalyticsEvent: async () => ({}),
        trackConversionStage: async () => ({}),
        recordPerformanceMetric: async () => ({}),
        createABTestExperiment: async () => ({}),
        getActiveABTests: async () => ([]),
        getABTestResults: async () => null,
        recordABTestOutcome: async () => ({}),
        selectABTestVariant: async () => null,
        getCachedMetrics: async () => ({}),
        cache: new Map(),
        clearCache: () => {},
        calculateCacheHitRate: () => 0,
        analyticsQueue: [],
        connectionPool: new Map(),
        analyticsProcessing: false,
        CACHE_TTL: 0,
        getFullClient: async () => null,
      }),
    );

    const res = await request(app).get('/admin/analytics/t1');
    expect(res.status).toBe(401);
  });

  test('GET /admin/analytics/:tenantKey returns 404 when dashboard missing', async () => {
    const app = express();
    app.use(express.json());
    app.use(
      createAdminAnalyticsRouter({
        getApiKey: () => 'secret',
        getAnalyticsDashboard: async () => null,
        generateAnalyticsReport: async () => ({}),
        trackAnalyticsEvent: async () => ({}),
        trackConversionStage: async () => ({}),
        recordPerformanceMetric: async () => ({}),
        createABTestExperiment: async () => ({}),
        getActiveABTests: async () => ([]),
        getABTestResults: async () => ({}),
        recordABTestOutcome: async () => ({}),
        selectABTestVariant: async () => ({}),
        getCachedMetrics: async () => ({}),
        cache: new Map(),
        clearCache: () => {},
        calculateCacheHitRate: () => 0,
        analyticsQueue: [],
        connectionPool: new Map(),
        analyticsProcessing: false,
        CACHE_TTL: 0,
        getFullClient: async () => null,
      }),
    );

    const res = await request(app).get('/admin/analytics/t1').set('X-API-Key', 'secret');
    expect(res.status).toBe(404);
  });

  test('POST /admin/analytics/:tenantKey/track returns 400 when required fields missing', async () => {
    const app = express();
    app.use(express.json());
    app.use(
      createAdminAnalyticsRouter({
        getApiKey: () => 'secret',
        getAnalyticsDashboard: async () => ({ summary: { totalLeads: 0, conversionRate: 0 } }),
        generateAnalyticsReport: async () => ({}),
        trackAnalyticsEvent: async () => ({}),
        trackConversionStage: async () => ({}),
        recordPerformanceMetric: async () => ({}),
        createABTestExperiment: async () => ({}),
        getActiveABTests: async () => ([]),
        getABTestResults: async () => ({}),
        recordABTestOutcome: async () => ({}),
        selectABTestVariant: async () => ({}),
        getCachedMetrics: async () => ({}),
        cache: new Map(),
        clearCache: () => {},
        calculateCacheHitRate: () => 0,
        analyticsQueue: [],
        connectionPool: new Map(),
        analyticsProcessing: false,
        CACHE_TTL: 0,
        getFullClient: async () => null,
      }),
    );

    const res = await request(app)
      .post('/admin/analytics/t1/track')
      .set('X-API-Key', 'secret')
      .send({ eventType: '', eventCategory: '' });
    expect(res.status).toBe(400);
  });

  test('POST /admin/analytics/:tenantKey/metrics returns 400 when metricName/value missing', async () => {
    const app = express();
    app.use(express.json());
    app.use(
      createAdminAnalyticsRouter({
        getApiKey: () => 'secret',
        getAnalyticsDashboard: async () => ({ summary: { totalLeads: 0, conversionRate: 0 } }),
        generateAnalyticsReport: async () => ({}),
        trackAnalyticsEvent: async () => ({}),
        trackConversionStage: async () => ({}),
        recordPerformanceMetric: async () => ({}),
        createABTestExperiment: async () => ({}),
        getActiveABTests: async () => ([]),
        getABTestResults: async () => ({}),
        recordABTestOutcome: async () => ({}),
        selectABTestVariant: async () => ({}),
        getCachedMetrics: async () => ({}),
        cache: new Map(),
        clearCache: () => {},
        calculateCacheHitRate: () => 0,
        analyticsQueue: [],
        connectionPool: new Map(),
        analyticsProcessing: false,
        CACHE_TTL: 0,
        getFullClient: async () => null,
      }),
    );

    const res = await request(app)
      .post('/admin/analytics/t1/metrics')
      .set('X-API-Key', 'secret')
      .send({ metricName: '', metricValue: undefined });
    expect(res.status).toBe(400);
  });

  test('GET /admin/ab-tests/:tenantKey returns ok true when deps return rows', async () => {
    const app = express();
    app.use(express.json());
    app.use(
      createAdminAnalyticsRouter({
        getApiKey: () => 'secret',
        getAnalyticsDashboard: async () => ({ summary: { totalLeads: 0, conversionRate: 0 } }),
        generateAnalyticsReport: async () => ({}),
        trackAnalyticsEvent: async () => ({}),
        trackConversionStage: async () => ({}),
        recordPerformanceMetric: async () => ({}),
        createABTestExperiment: async () => ({}),
        getActiveABTests: async () => ([{ id: 1 }]),
        getABTestResults: async () => ({ variants: [] }),
        recordABTestOutcome: async () => ({}),
        selectABTestVariant: async () => ({}),
        getCachedMetrics: async () => ({}),
        cache: new Map(),
        clearCache: () => {},
        calculateCacheHitRate: () => 0,
        analyticsQueue: [],
        connectionPool: new Map(),
        analyticsProcessing: false,
        CACHE_TTL: 0,
        getFullClient: async () => null,
      }),
    );

    const res = await request(app).get('/admin/ab-tests/t1').set('X-API-Key', 'secret');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({ ok: true }));
  });

  test('happy: GET /admin/performance/system/overview returns ok true', async () => {
    const app = express();
    app.use(express.json());
    app.use(
      createAdminAnalyticsRouter({
        getApiKey: () => 'secret',
        getAnalyticsDashboard: async () => null,
        generateAnalyticsReport: async () => null,
        trackAnalyticsEvent: async () => null,
        trackConversionStage: async () => null,
        recordPerformanceMetric: async () => null,
        createABTestExperiment: async () => null,
        getActiveABTests: async () => [],
        getABTestResults: async () => null,
        recordABTestOutcome: async () => null,
        selectABTestVariant: async () => null,
        getCachedMetrics: async () => ({}),
        cache: new Map(),
        clearCache: () => {},
        calculateCacheHitRate: () => 0,
        analyticsQueue: [],
        connectionPool: new Map(),
        analyticsProcessing: false,
        CACHE_TTL: 123,
        getFullClient: async () => null,
      }),
    );

    const res = await request(app)
      .get('/admin/performance/system/overview')
      .set('X-API-Key', 'secret');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({ ok: true, overview: expect.any(Object) }));
  });

  test('happy: tenant performance + cache clear + calendar events', async () => {
    const cache = new Map([
      ['t1:a', 1],
      ['t2:b', 2],
    ]);
    const clearCache = (pattern) => {
      for (const k of Array.from(cache.keys())) {
        if (String(k).includes(String(pattern))) cache.delete(k);
      }
    };

    const app = express();
    app.use(express.json());
    app.use(
      createAdminAnalyticsRouter({
        getApiKey: () => 'secret',
        getAnalyticsDashboard: async () => ({ summary: { totalLeads: 0, conversionRate: 0 } }),
        generateAnalyticsReport: async () => ({ ok: true }),
        trackAnalyticsEvent: async () => ({ id: 1 }),
        trackConversionStage: async () => ({ id: 2 }),
        recordPerformanceMetric: async () => ({ id: 3 }),
        createABTestExperiment: async () => ({ id: 4 }),
        getActiveABTests: async () => ([]),
        getABTestResults: async () => ({ summary: { totalParticipants: 0 } }),
        recordABTestOutcome: async () => ({ id: 5 }),
        selectABTestVariant: async () => ({ name: 'A', config: { x: 1 } }),
        getCachedMetrics: async () => ({ ok: true }),
        cache,
        clearCache,
        calculateCacheHitRate: () => 0.5,
        analyticsQueue: [{ id: 1 }],
        connectionPool: new Map([['c', {}]]),
        analyticsProcessing: true,
        CACHE_TTL: 123,
        getFullClient: async () => ({ booking: { timezone: 'UTC', calendarId: 'primary' } }),
      }),
    );

    const perf = await request(app).get('/admin/performance/t1').set('X-API-Key', 'secret').expect(200);
    expect(perf.body).toEqual(expect.objectContaining({ ok: true, cache: expect.any(Object) }));

    const cleared = await request(app)
      .post('/admin/performance/t1/cache/clear')
      .set('X-API-Key', 'secret')
      .send({ pattern: 't1:' })
      .expect(200);
    expect(cleared.body).toEqual(expect.objectContaining({ ok: true, cleared: 1 }));

    const cal = await request(app)
      .get('/admin/calendar-events/t1?limit=1')
      .set('X-API-Key', 'secret')
      .expect(200);
    expect(cal.body).toEqual(expect.objectContaining({ ok: true, tenantKey: 't1', events: expect.any(Array) }));
  });

  test('AB test create + assign + outcome + results 404 branch', async () => {
    const app = express();
    app.use(express.json());
    app.use(
      createAdminAnalyticsRouter({
        getApiKey: () => 'secret',
        getAnalyticsDashboard: async () => ({ summary: { totalLeads: 0, conversionRate: 0 } }),
        generateAnalyticsReport: async () => ({ ok: true }),
        trackAnalyticsEvent: async () => ({ id: 1 }),
        trackConversionStage: async () => ({ id: 2 }),
        recordPerformanceMetric: async () => ({ id: 3 }),
        createABTestExperiment: async () => ({ id: 4 }),
        getActiveABTests: async () => ([]),
        getABTestResults: async () => null, // drive 404
        recordABTestOutcome: async () => null, // drive 404
        selectABTestVariant: async () => ({ name: 'A', config: {} }),
        getCachedMetrics: async () => ({ ok: true }),
        cache: new Map(),
        clearCache: () => {},
        calculateCacheHitRate: () => 0,
        analyticsQueue: [],
        connectionPool: new Map(),
        analyticsProcessing: false,
        CACHE_TTL: 0,
        getFullClient: async () => null,
      }),
    );

    const created = await request(app)
      .post('/admin/ab-tests/t1')
      .set('X-API-Key', 'secret')
      .send({ experimentName: 'exp1', variants: [{ name: 'A' }, { name: 'B' }] })
      .expect(200);
    expect(created.body).toEqual(expect.objectContaining({ ok: true }));

    const assigned = await request(app)
      .post('/admin/ab-tests/t1/assign')
      .set('X-API-Key', 'secret')
      .send({ leadPhone: '+1', experimentName: 'exp1' })
      .expect(200);
    expect(assigned.body).toEqual(expect.objectContaining({ ok: true, variant: 'A' }));

    await request(app)
      .post('/admin/ab-tests/t1/exp1/outcome')
      .set('X-API-Key', 'secret')
      .send({ leadPhone: '+1', outcome: 'converted' })
      .expect(404);

    await request(app)
      .get('/admin/ab-tests/t1/exp1/results')
      .set('X-API-Key', 'secret')
      .expect(404);
  });
});

describe('routes/admin-cost-access (in admin-analytics-mount.js)', () => {
  test('401 without X-API-Key (cost optimization)', async () => {
    const app = express();
    app.use(express.json());
    app.use(
      createAdminCostAndAccessRouter({
        getApiKey: () => 'secret',
        getCostOptimizationMetrics: async () => null,
        loadDb: async () => ({}),
        authenticateApiKey: (req, res, next) => next(),
        rateLimitMiddleware: (req, res, next) => next(),
        requirePermission: () => (req, res, next) => next(),
      })
    );

    const res = await request(app).get('/admin/cost-optimization/t1');
    expect(res.status).toBe(401);
  });

  test('happy: POST /admin/budget-limits/:tenantKey returns ok true', async () => {
    const app = express();
    app.use(express.json());
    app.use(
      createAdminCostAndAccessRouter({
        getApiKey: () => 'secret',
        getCostOptimizationMetrics: async () => null,
        loadDb: async () => ({
          setBudgetLimit: async (payload) => ({ id: 1, ...payload }),
        }),
        authenticateApiKey: (req, res, next) => next(),
        rateLimitMiddleware: (req, res, next) => next(),
        requirePermission: () => (req, res, next) => next(),
      })
    );

    const res = await request(app)
      .post('/admin/budget-limits/t1')
      .set('X-API-Key', 'secret')
      .send({ budgetType: 'daily', dailyLimit: 10, currency: 'USD' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({ ok: true }));
    expect(res.body.budget).toEqual(expect.objectContaining({ clientKey: 't1', budgetType: 'daily' }));
  });

  test('happy: GET cost optimization + POST cost alert + create user + create api key', async () => {
    const app = express();
    app.use(express.json());
    app.use(
      createAdminCostAndAccessRouter({
        getApiKey: () => 'secret',
        getCostOptimizationMetrics: async () => ({
          costs: { daily: { total_cost: 1 } },
          optimization: { dailyBudgetUtilization: 0.2 }
        }),
        loadDb: async () => ({
          setBudgetLimit: async (payload) => ({ id: 1, ...payload }),
          getTotalCostsByTenant: async () => ({ total_cost: 2 }),
          createCostAlert: async (payload) => ({ id: 9, ...payload }),
          hashPassword: async (pw) => `hash:${pw}`,
          createUserAccount: async (payload) => ({ id: 1, ...payload, is_active: true, created_at: new Date().toISOString() }),
          generateApiKey: () => 'sk_test',
          hashApiKey: (k) => `h:${k}`,
          createApiKey: async () => ({
            id: 2,
            key_name: 'k1',
            permissions: ['a'],
            rate_limit_per_minute: 1,
            rate_limit_per_hour: 2,
            is_active: true,
            expires_at: null,
            created_at: new Date().toISOString()
          }),
        }),
        authenticateApiKey: (_req, _res, next) => next(),
        rateLimitMiddleware: (_req, _res, next) => next(),
        requirePermission: () => (_req, _res, next) => next(),
      })
    );

    const cost = await request(app).get('/admin/cost-optimization/t1').set('X-API-Key', 'secret').expect(200);
    expect(cost.body).toEqual(expect.objectContaining({ ok: true }));

    const alert = await request(app)
      .post('/admin/cost-alerts/t1')
      .set('X-API-Key', 'secret')
      .send({ alertType: 'daily', threshold: 5, period: 'daily' })
      .expect(200);
    expect(alert.body).toEqual(expect.objectContaining({ ok: true, alert: expect.any(Object) }));

    const user = await request(app)
      .post('/admin/users/t1')
      .set('X-API-Key', 'secret')
      .send({ username: 'u', email: 'e', password: 'p', role: 'user', permissions: ['a'] })
      .expect(200);
    expect(user.body).toEqual(expect.objectContaining({ ok: true, user: expect.any(Object) }));

    const key = await request(app)
      .post('/admin/api-keys/t1')
      .set('X-API-Key', 'secret')
      .send({ keyName: 'k1', permissions: ['a'], rateLimitPerMinute: 1, rateLimitPerHour: 2 })
      .expect(200);
    expect(key.body).toEqual(expect.objectContaining({ ok: true, secretKey: 'sk_test' }));
  });
});

