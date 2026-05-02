import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import request from 'supertest';

import { createContractApp } from '../helpers/contract-harness.js';

beforeEach(() => {
  jest.resetModules();
});

async function createAppWithErrors(router) {
  const express = (await import('express')).default;
  const { formatErrorResponse } = await import('../../lib/errors.js');
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '10mb' }));
  app.use('/api/clients', router);
   
  app.use((err, req, res, _next) => {
    const status = err?.statusCode || 500;
    res.status(status).json(formatErrorResponse(err, req));
  });
  return app;
}

describe('routes/clients.js contracts (branch-focused)', () => {
  test('GET /api/clients applies safeQuery + pagination response shape', async () => {
    const safeQuery = jest.fn(async (sql) => {
      if (String(sql).includes('COUNT(*)')) return { rows: [{ total: '3' }] };
      return { rows: [{ client_key: 'c1' }] };
    });

    jest.unstable_mockModule('../../middleware/security.js', () => ({
      authenticateApiKey: (_req, _res, next) => next(),
      requireTenantAccess: (_req, _res, next) => next()
    }));
    jest.unstable_mockModule('../../middleware/validation.js', () => ({
      validateRequest: () => (_req, _res, next) => next(),
      validationSchemas: { queryParams: {}, createClient: {} }
    }));
    jest.unstable_mockModule('../../db.js', () => ({
      safeQuery,
      getFullClient: jest.fn(async () => null),
      upsertFullClient: jest.fn(async () => ({}))
    }));
    jest.unstable_mockModule('../../lib/retry-logic.js', () => ({
      getRetryManager: () => ({ execute: (fn) => fn() }),
      getCircuitBreaker: () => ({ execute: (fn) => fn() })
    }));

    const { default: router } = await import('../../routes/clients.js');
    const app = createContractApp({ mounts: [{ path: '/api/clients', router }] });

    const res = await request(app)
      .get('/api/clients?limit=10&offset=0&sortBy=not_a_field&sortOrder=asc')
      .expect(200);

    expect(res.body).toEqual(
      expect.objectContaining({
        success: true,
        data: expect.any(Array),
        pagination: expect.objectContaining({
          limit: 10,
          offset: 0,
          total: 3,
          hasMore: expect.any(Boolean)
        })
      })
    );
    expect(safeQuery).toHaveBeenCalled();
  });

  test('PUT /api/clients/:clientKey returns 400 when tenant mismatch', async () => {
    jest.unstable_mockModule('../../middleware/security.js', () => ({
      authenticateApiKey: (_req, _res, next) => next(),
      requireTenantAccess: (req, _res, next) => {
        req.clientKey = 'c1';
        next();
      }
    }));
    jest.unstable_mockModule('../../middleware/validation.js', () => ({
      validateRequest: () => (_req, _res, next) => next(),
      validationSchemas: { queryParams: {}, createClient: {} }
    }));
    jest.unstable_mockModule('../../db.js', () => ({
      safeQuery: jest.fn(async () => ({ rows: [] })),
      getFullClient: jest.fn(async () => ({ clientKey: 'c2' })),
      upsertFullClient: jest.fn(async () => ({}))
    }));
    jest.unstable_mockModule('../../lib/retry-logic.js', () => ({
      getRetryManager: () => ({ execute: (fn) => fn() }),
      getCircuitBreaker: () => ({ execute: (fn) => fn() })
    }));

    const { default: router } = await import('../../routes/clients.js');
    const app = await createAppWithErrors(router);

    const res = await request(app).put('/api/clients/c2').send({ businessName: 'X' }).expect(400);
    expect(res.body).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({ statusCode: 400 })
      })
    );
  });

  test('DELETE /api/clients/:clientKey returns 422 when dependent data exists', async () => {
    const safeQuery = jest.fn(async (sql) => {
      if (String(sql).includes('SELECT') && String(sql).includes('lead_count')) {
        return { rows: [{ lead_count: '1', call_count: '0', appointment_count: '0' }] };
      }
      return { rows: [] };
    });

    jest.unstable_mockModule('../../middleware/security.js', () => ({
      authenticateApiKey: (_req, _res, next) => next(),
      requireTenantAccess: (req, _res, next) => {
        req.clientKey = 'c1';
        next();
      }
    }));
    jest.unstable_mockModule('../../middleware/validation.js', () => ({
      validateRequest: () => (_req, _res, next) => next(),
      validationSchemas: { queryParams: {}, createClient: {} }
    }));
    jest.unstable_mockModule('../../db.js', () => ({
      safeQuery,
      getFullClient: jest.fn(async () => ({ clientKey: 'c1' })),
      upsertFullClient: jest.fn(async () => ({}))
    }));
    jest.unstable_mockModule('../../lib/retry-logic.js', () => ({
      getRetryManager: () => ({ execute: (fn) => fn() }),
      getCircuitBreaker: () => ({ execute: (fn) => fn() })
    }));

    const { default: router } = await import('../../routes/clients.js');
    const app = await createAppWithErrors(router);

    const res = await request(app).delete('/api/clients/c1').send({ clientKey: 'c1' }).expect(422);
    expect(res.body).toEqual(expect.objectContaining({ error: expect.objectContaining({ statusCode: 422 }) }));
    expect(safeQuery).toHaveBeenCalled();
  });
});

