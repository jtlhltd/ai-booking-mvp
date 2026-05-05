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

describe('canary: tenant.daily-summary-public-readonly', () => {
  test('GET /api/daily-summary/:clientKey is public read-only (no X-API-Key required)', async () => {
    const { createDailySummaryRouter } = await import('../../routes/daily-summary.js');
    const router = createDailySummaryRouter({
      getFullClient: jest.fn(async () => null),
      resolveLogisticsSpreadsheetId: () => null,
      sheets: {},
      isPostgres: false,
      poolQuerySelect: jest.fn(async () => ({ rows: [] })),
      query: jest.fn(async () => ({ rows: [] })),
      pickTimezone: () => 'UTC',
    });
    const app = createContractApp({ mounts: [{ path: '/', router }] });
    const res = await request(app).get('/daily-summary/not-a-tenant');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control'] || '').toMatch(/no-store/i);
    expect(res.body?.ok).toBe(true);
    expect(res.body?.configured).toBe(false);
  });
});

describe('canary: tenant.scoped-reads-require-api-key', () => {
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
