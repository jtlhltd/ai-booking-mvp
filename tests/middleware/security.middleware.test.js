import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';

beforeEach(() => {
  jest.resetModules();
});

function makeApp({ middleware, handler } = {}) {
  const app = express();
  app.use(express.json());
  app.use(middleware);
  app.get('/ok', handler || ((_req, res) => res.json({ ok: true })));
  app.post('/ok', handler || ((_req, res) => res.json({ ok: true })));
  return app;
}

describe('middleware/security.js', () => {
  test('authenticateApiKey returns 401 when missing API key', async () => {
    const { authenticateApiKey } = await import('../../middleware/security.js');
    const app = makeApp({ middleware: authenticateApiKey });
    const res = await request(app).get('/ok').expect(401);
    expect(res.body).toEqual(expect.objectContaining({ code: 'MISSING_API_KEY' }));
  });

  test('authenticateApiKey returns 401 when key invalid (and logging failure is swallowed)', async () => {
    jest.unstable_mockModule('../../db.js', () => ({
      getApiKeyByHash: jest.fn(async () => null),
      updateApiKeyLastUsed: jest.fn(),
      logSecurityEvent: jest.fn(async () => {
        throw new Error('log_down');
      })
    }));
    const { authenticateApiKey } = await import('../../middleware/security.js');
    const app = makeApp({ middleware: authenticateApiKey });
    const res = await request(app).get('/ok').set('X-API-Key', 'ak_test').expect(401);
    expect(res.body).toEqual(expect.objectContaining({ code: 'INVALID_API_KEY' }));
  });

  test('authenticateApiKey sets req.apiKey and req.clientKey on success', async () => {
    jest.unstable_mockModule('../../db.js', () => ({
      getApiKeyByHash: jest.fn(async () => ({ id: 1, client_key: 'c1', permissions: [] })),
      updateApiKeyLastUsed: jest.fn(async () => {}),
      logSecurityEvent: jest.fn(async () => {})
    }));
    const { authenticateApiKey } = await import('../../middleware/security.js');
    const app = makeApp({
      middleware: authenticateApiKey,
      handler: (req, res) => res.json({ ok: true, clientKey: req.clientKey, apiKeyId: req.apiKey?.id })
    });
    const res = await request(app).get('/ok').set('X-API-Key', 'ak_test').expect(200);
    expect(res.body).toEqual({ ok: true, clientKey: 'c1', apiKeyId: 1 });
  });

  test('rateLimitMiddleware is a no-op when tenant unknown', async () => {
    jest.unstable_mockModule('../../db.js', () => ({
      checkRateLimit: jest.fn(async () => ({ exceeded: false, remainingMinute: 1, remainingHour: 1 })),
      recordRateLimitRequest: jest.fn(async () => {}),
      logSecurityEvent: jest.fn(async () => {})
    }));
    const { rateLimitMiddleware } = await import('../../middleware/security.js');
    const app = makeApp({ middleware: rateLimitMiddleware });
    await request(app).get('/ok').expect(200);
  });

  test('requireTenantAccess returns 403 when requested tenant differs', async () => {
    const { requireTenantAccess } = await import('../../middleware/security.js');
    const app = makeApp({
      middleware: (req, _res, next) => {
        req.clientKey = 'c1';
        next();
      }
    });
    app.post('/tenant/:tenantKey', requireTenantAccess, (_req, res) => res.json({ ok: true }));
    const res = await request(app).post('/tenant/c2').send({}).expect(403);
    expect(res.body).toEqual(expect.objectContaining({ code: 'TENANT_ACCESS_DENIED' }));
  });
});

