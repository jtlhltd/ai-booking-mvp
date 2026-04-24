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
});

