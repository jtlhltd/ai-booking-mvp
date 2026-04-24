import { describe, expect, test, jest, beforeEach, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { DateTime } from 'luxon';

import { createContractApp, withEnv } from '../helpers/contract-harness.js';

beforeEach(() => {
  jest.resetModules();
});

let consoleErrorSpy;
beforeAll(() => {
  consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterAll(() => {
  consoleErrorSpy.mockRestore();
});

describe('Admin low-coverage routers — meaningful happy+failure contracts', () => {
  test('admin-overview: GET /api/admin/business-stats returns stats object (happy)', async () => {
    const query = jest.fn(async () => ({ rows: [{ count: '0' }] }));
    const listClientSummaries = jest.fn(async () => [{ clientKey: 'c1', isEnabled: true }]);
    const getCallsByTenant = jest.fn(async () => []);
    const getLeadsByClient = jest.fn(async () => []);

    jest.unstable_mockModule('../../db.js', () => ({
      query,
      listClientSummaries,
      getCallsByTenant,
      getLeadsByClient,
      dbType: 'postgres'
    }));

    const { createAdminOverviewRouter } = await import('../../routes/admin-overview.js');
    const app = createContractApp({
      mounts: [{ path: '/api/admin', router: () => createAdminOverviewRouter({ broadcast: jest.fn() }) }],
    });

    const res = await request(app).get('/api/admin/business-stats').expect(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        activeClients: expect.any(Number),
        monthlyRevenue: expect.any(Number),
        totalCalls: expect.any(Number),
        totalBookings: expect.any(Number)
      })
    );
  });

  test('admin-overview: GET /api/admin/recent-activity returns [] when db throws (failure tolerance)', async () => {
    const query = jest.fn(async () => {
      throw new Error('db down');
    });
    jest.unstable_mockModule('../../db.js', () => ({
      query,
      listClientSummaries: jest.fn(async () => []),
      getCallsByTenant: jest.fn(async () => []),
      getLeadsByClient: jest.fn(async () => []),
      dbType: 'postgres'
    }));

    const { createAdminOverviewRouter } = await import('../../routes/admin-overview.js');
    const app = createContractApp({
      mounts: [{ path: '/api/admin', router: () => createAdminOverviewRouter({ broadcast: jest.fn() }) }],
    });

    const res = await request(app).get('/api/admin/recent-activity').expect(200);
    expect(res.body).toEqual([]);
  });

  test('admin-email-tasks-deals: GET /api/admin/email-templates returns array (happy)', async () => {
    jest.unstable_mockModule('../../db.js', () => ({
      query: jest.fn(async () => ({ rows: [{ id: 1, name: 'T' }] })),
    }));

    const { createAdminEmailTasksDealsRouter } = await import('../../routes/admin-email-tasks-deals.js');
    const app = createContractApp({
      mounts: [{ path: '/api/admin', router: () => createAdminEmailTasksDealsRouter({}) }],
    });

    const res = await request(app).get('/api/admin/email-templates').expect(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('admin-email-tasks-deals: POST /api/admin/email-templates/send returns 404 when template missing (failure)', async () => {
    jest.unstable_mockModule('../../db.js', () => ({
      query: jest.fn(async (sql) => {
        if (String(sql).includes('SELECT * FROM email_templates')) return { rows: [] };
        return { rows: [] };
      }),
    }));

    const { createAdminEmailTasksDealsRouter } = await import('../../routes/admin-email-tasks-deals.js');
    const app = createContractApp({
      mounts: [{ path: '/api/admin', router: () => createAdminEmailTasksDealsRouter({}) }],
    });

    await request(app)
      .post('/api/admin/email-templates/send')
      .send({ templateId: 123, recipientEmail: 'a@b.com', variables: {} })
      .expect(404);
  });

  test('admin-clients: GET /api/admin/search requires q (failure) and returns results when q provided (happy)', async () => {
    jest.unstable_mockModule('../../db.js', () => ({
      query: jest.fn(async () => ({ rows: [] })),
      listClientSummaries: jest.fn(async () => [{ clientKey: 'c1', displayName: 'Acme', industry: 'x' }]),
      getFullClient: jest.fn(async () => null),
      upsertFullClient: jest.fn(async () => {}),
      deleteClient: jest.fn(async () => {}),
      getLeadsByClient: jest.fn(async () => []),
      getCallsByTenant: jest.fn(async () => []),
    }));
    jest.unstable_mockModule('../../lib/admin-hub-data.js', () => ({
      getClientsData: jest.fn(async () => []),
      getCallsData: jest.fn(async () => []),
    }));

    const { createAdminClientsRouter } = await import('../../routes/admin-clients.js');
    const app = createContractApp({
      mounts: [{ path: '/api/admin', router: () => createAdminClientsRouter({ broadcast: jest.fn() }) }],
    });

    await request(app).get('/api/admin/search').expect(400);

    const res = await request(app).get('/api/admin/search').query({ q: 'ac' }).expect(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        clients: expect.any(Array),
        leads: expect.any(Array),
        calls: expect.any(Array),
        appointments: expect.any(Array),
      })
    );
    expect(res.body.clients[0]).toEqual(expect.objectContaining({ clientKey: 'c1' }));
  });

  test('admin-call-queue: GET /api/admin/call-queue/peek/:clientKey returns ok true (happy)', async () => {
    jest.unstable_mockModule('../../middleware/security.js', () => ({
      authenticateApiKey: (_req, _res, next) => next(),
      requirePermission: (_perm) => (_req, _res, next) => next(),
      requireTenantAccess: (_req, _res, next) => next(),
    }));

    const query = jest.fn(async () => ({ rows: [] }));
    jest.unstable_mockModule('../../db.js', () => ({
      query,
      getFullClient: jest.fn(async (k) => ({ clientKey: k, booking: { timezone: 'Europe/London' } })),
      dbType: 'postgres',
    }));

    await withEnv({ API_KEY: 'k' }, async () => {
      const { createAdminCallQueueRouter } = await import('../../routes/admin-call-queue.js');
      const app = createContractApp({
        mounts: [
          {
            path: '/api/admin',
            router: () =>
              createAdminCallQueueRouter({
                query,
                getFullClient: async (k) => ({ clientKey: k, booking: { timezone: 'Europe/London' } }),
                pickTimezone: (c) => c?.booking?.timezone || 'Europe/London',
                DateTime,
                TIMEZONE: 'Europe/London',
                isPostgres: true,
                pgQueueLeadPhoneKeyExpr: (col) => col,
                isBusinessHours: () => true,
              }),
          },
        ],
      });

      const res = await request(app).get('/api/admin/call-queue/peek/c1').expect(200);
      expect(res.body).toEqual(expect.objectContaining({ ok: true }));
    });
  });
});

