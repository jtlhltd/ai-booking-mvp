import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import request from 'supertest';

import { createContractApp } from '../helpers/contract-harness.js';
import { requireTenantAccessOrAdmin } from '../../middleware/security.js';
import { createDashboardRouteAuthStubs } from '../helpers/dashboard-route-auth-stubs.js';

beforeEach(() => {
  jest.resetModules();
});

const { authenticateApiKey: stubDashboardApiKey } = createDashboardRouteAuthStubs();

describe('routes/ops-health-and-dnc.js contracts', () => {
  test('GET /dnc/list returns 400 when clientKey missing', async () => {
    const { createOpsHealthAndDncRouter } = await import('../../routes/ops-health-and-dnc.js');
    const router = createOpsHealthAndDncRouter({
      listOptOutList: jest.fn(async () => []),
      upsertOptOut: jest.fn(),
      deactivateOptOut: jest.fn(),
      getFullClient: jest.fn(),
      resolveLogisticsSpreadsheetId: jest.fn(),
      query: jest.fn(),
      dbType: 'sqlite',
      DB_PATH: 'x',
      authenticateApiKey: stubDashboardApiKey,
      requireTenantAccessOrAdmin
    });
    const app = createContractApp({ mounts: [{ path: '/', router }] });
    const res = await request(app).get('/dnc/list').expect(400);
    expect(res.body).toEqual(
      expect.objectContaining({ error: 'Tenant key required', code: 'MISSING_TENANT_KEY' })
    );
  });

  test('POST /dnc/add returns 400 on invalid_phone errors', async () => {
    const { createOpsHealthAndDncRouter } = await import('../../routes/ops-health-and-dnc.js');
    const router = createOpsHealthAndDncRouter({
      listOptOutList: jest.fn(async () => []),
      upsertOptOut: jest.fn(async () => {
        const err = new Error('bad');
        err.code = 'invalid_phone';
        throw err;
      }),
      deactivateOptOut: jest.fn(),
      getFullClient: jest.fn(),
      resolveLogisticsSpreadsheetId: jest.fn(),
      query: jest.fn(),
      dbType: 'sqlite',
      DB_PATH: 'x',
      authenticateApiKey: stubDashboardApiKey,
      requireTenantAccessOrAdmin
    });
    const app = createContractApp({ mounts: [{ path: '/', router }] });
    const res = await request(app).post('/dnc/add').send({ clientKey: 'c1', phone: 'x' }).expect(400);
    expect(res.body).toEqual(expect.objectContaining({ ok: false, error: 'invalid_phone' }));
  });

  test('GET /ops/health/:clientKey falls back to listOptOutList count when query fails', async () => {
    const { createOpsHealthAndDncRouter } = await import('../../routes/ops-health-and-dnc.js');
    const router = createOpsHealthAndDncRouter({
      getFullClient: jest.fn(async () => ({ clientKey: 'c1' })),
      resolveLogisticsSpreadsheetId: jest.fn(() => 'sheet_1'),
      listOptOutList: jest.fn(async () => [{ phone: '+441' }]),
      upsertOptOut: jest.fn(),
      deactivateOptOut: jest.fn(),
      query: jest.fn(async () => {
        throw new Error('db_down');
      }),
      dbType: 'sqlite',
      DB_PATH: 'data/app.db',
      authenticateApiKey: stubDashboardApiKey,
      requireTenantAccessOrAdmin
    });
    const app = createContractApp({ mounts: [{ path: '/', router }] });
    const res = await request(app).get('/ops/health/c1').expect(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        ok: true,
        sheet: { configured: true },
        dnc: { activeCount: 1 }
      })
    );
  });
});

