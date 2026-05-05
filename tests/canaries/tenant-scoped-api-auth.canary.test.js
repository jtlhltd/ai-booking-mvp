/**
 * Canary for Intent Contract: tenant.scoped-reads-require-api-key
 *
 * Tenant-scoped dashboard routes must require X-API-Key (authenticateApiKey runs first).
 */
import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import request from 'supertest';

import { createContractApp } from '../helpers/contract-harness.js';

beforeEach(() => {
  jest.resetModules();
});

describe('canary: tenant.scoped-reads-require-api-key', () => {
  test('GET /api/daily-summary/:clientKey returns 401 without X-API-Key', async () => {
    jest.unstable_mockModule('../../db.js', () => ({
      getApiKeyByHash: jest.fn(async () => null),
      updateApiKeyLastUsed: jest.fn(),
      logSecurityEvent: jest.fn()
    }));
    const { authenticateApiKey, requireTenantAccessOrAdmin } = await import('../../middleware/security.js');
    const { createDailySummaryRouter } = await import('../../routes/daily-summary.js');
    const router = createDailySummaryRouter({
      getFullClient: jest.fn(),
      resolveLogisticsSpreadsheetId: () => null,
      sheets: {},
      isPostgres: false,
      poolQuerySelect: jest.fn(async () => ({ rows: [] })),
      query: jest.fn(async () => ({ rows: [] })),
      pickTimezone: () => 'UTC',
      authenticateApiKey,
      requireTenantAccessOrAdmin
    });
    const app = createContractApp({ mounts: [{ path: '/', router }] });
    const res = await request(app).get('/daily-summary/acme');
    expect(res.status).toBe(401);
    expect(res.body?.code || res.body?.error).toBeTruthy();
  });

  test('GET /api/dnc/list returns 401 without X-API-Key', async () => {
    jest.unstable_mockModule('../../db.js', () => ({
      getApiKeyByHash: jest.fn(async () => null),
      updateApiKeyLastUsed: jest.fn(),
      logSecurityEvent: jest.fn()
    }));
    const { authenticateApiKey, requireTenantAccessOrAdmin } = await import('../../middleware/security.js');
    const { createOpsHealthAndDncRouter } = await import('../../routes/ops-health-and-dnc.js');
    const router = createOpsHealthAndDncRouter({
      getFullClient: jest.fn(),
      resolveLogisticsSpreadsheetId: jest.fn(),
      listOptOutList: jest.fn(),
      upsertOptOut: jest.fn(),
      deactivateOptOut: jest.fn(),
      query: jest.fn(),
      dbType: 'postgres',
      DB_PATH: 'x',
      authenticateApiKey,
      requireTenantAccessOrAdmin
    });
    const app = createContractApp({ mounts: [{ path: '/', router }] });
    const res = await request(app).get('/dnc/list?clientKey=acme');
    expect(res.status).toBe(401);
  });

  test('GET /api/sms-delivery-rate/:clientKey returns 401 without X-API-Key', async () => {
    jest.unstable_mockModule('../../db.js', () => ({
      getApiKeyByHash: jest.fn(async () => null),
      updateApiKeyLastUsed: jest.fn(),
      logSecurityEvent: jest.fn()
    }));
    const { authenticateApiKey, requireTenantAccessOrAdmin } = await import('../../middleware/security.js');
    const { createQuickWinMetricsRouter } = await import('../../routes/quick-win-metrics.js');
    const router = createQuickWinMetricsRouter({
      query: jest.fn(),
      cacheMiddleware: () => (_req, _res, next) => next(),
      authenticateApiKey,
      requireTenantAccessOrAdmin
    });
    const app = createContractApp({ mounts: [{ path: '/', router }] });
    const res = await request(app).get('/sms-delivery-rate/acme');
    expect(res.status).toBe(401);
  });
});
