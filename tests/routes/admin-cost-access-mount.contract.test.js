import { describe, test, expect } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createAdminCostAndAccessRouter } from '../../routes/admin-cost-access-mount.js';

describe('routes/admin-cost-access-mount', () => {
  test('401 without X-API-Key (cost optimization)', async () => {
    const app = express();
    app.use(express.json());
    app.use(
      createAdminCostAndAccessRouter({
        getCostOptimizationMetrics: async () => null,
        loadDb: async () => ({}),
        getApiKey: () => 'secret',
        authenticateApiKey: (req, res, next) => next(),
        rateLimitMiddleware: (req, res, next) => next(),
        requirePermission: () => (req, res, next) => next(),
      }),
    );

    const res = await request(app).get('/admin/cost-optimization/c1');
    expect(res.status).toBe(401);
  });

  test('happy: POST /admin/budget-limits/:tenantKey returns ok true', async () => {
    const app = express();
    app.use(express.json());
    app.use(
      createAdminCostAndAccessRouter({
        getCostOptimizationMetrics: async () => null,
        loadDb: async () => ({
          setBudgetLimit: async (payload) => ({ id: 1, ...payload }),
        }),
        getApiKey: () => 'secret',
        authenticateApiKey: (req, res, next) => next(),
        rateLimitMiddleware: (req, res, next) => next(),
        requirePermission: () => (req, res, next) => next(),
      }),
    );

    const res = await request(app)
      .post('/admin/budget-limits/c1')
      .set('X-API-Key', 'secret')
      .send({ budgetType: 'daily', dailyLimit: 5, currency: 'USD' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({ ok: true }));
  });
});

