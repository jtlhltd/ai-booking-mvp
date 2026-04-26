import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import request from 'supertest';
import { createContractApp } from '../helpers/contract-harness.js';

beforeEach(() => {
  jest.resetModules();
  delete process.env.API_KEY;
});

describe('admin-clients + runtime-metrics mounts (contract coverage)', () => {
  test('admin-clients: GET /api/admin/client/:clientKey returns 404 when missing', async () => {
    jest.unstable_mockModule('../../db.js', () => ({
      query: jest.fn(async () => ({ rows: [] })),
      listClientSummaries: jest.fn(async () => []),
      getFullClient: jest.fn(async () => null),
      upsertFullClient: jest.fn(async () => {}),
      deleteClient: jest.fn(async () => {}),
      getLeadsByClient: jest.fn(async () => []),
      getCallsByTenant: jest.fn(async () => []),
    }));
    jest.unstable_mockModule('../../lib/admin-hub-data.js', () => ({
      getClientsData: jest.fn(async () => ({})),
      getCallsData: jest.fn(async () => ({})),
    }));

    const { createAdminClientsRouter } = await import('../../routes/admin-clients.js');
    const router = createAdminClientsRouter({ broadcast: jest.fn() });
    const app = createContractApp({ mounts: [{ path: '/api/admin', router }] });

    const res = await request(app).get('/api/admin/client/nope').expect(404);
    expect(res.body).toEqual({ error: 'Client not found' });
  });

  test('admin-clients: GET/PUT/DELETE/POST flows exercise happy + validation', async () => {
    const getFullClient = jest.fn(async (clientKey) =>
      clientKey === 'acme' ? { clientKey: 'acme', displayName: 'Acme', vapi: {} } : null,
    );
    const query = jest.fn(async (sql) => {
      const s = String(sql);
      if (s.includes('COUNT(*) as count') && s.includes('FROM appointments')) return { rows: [{ count: 2 }] };
      if (s.includes('FROM leads') && s.includes('JOIN tenants')) return { rows: [{ id: 1, name: 'L' }] };
      if (s.includes('FROM calls') && s.includes('lead_phone')) return { rows: [{ id: 1, lead_phone: '+1' }] };
      return { rows: [] };
    });
    const listClientSummaries = jest.fn(async () => [
      { clientKey: 'acme', displayName: 'Acme', industry: 'fitness' },
      { clientKey: 'other', displayName: 'Other', industry: 'plumbing' },
    ]);
    const upsertFullClient = jest.fn(async () => {});
    const deleteClient = jest.fn(async () => {});

    jest.unstable_mockModule('../../db.js', () => ({
      query,
      listClientSummaries,
      getFullClient,
      upsertFullClient,
      deleteClient,
      getLeadsByClient: jest.fn(async () => [{ id: 1 }, { id: 2 }]),
      getCallsByTenant: jest.fn(async () => [{ lead_phone: '+1', status: 'completed', outcome: 'booked', duration: 12, created_at: 'now' }]),
    }));
    const getClientsData = jest.fn(async () => ({ ok: true }));
    jest.unstable_mockModule('../../lib/admin-hub-data.js', () => ({
      getClientsData,
      getCallsData: jest.fn(async () => ({ ok: true })),
    }));

    const broadcast = jest.fn();
    const { createAdminClientsRouter } = await import('../../routes/admin-clients.js');
    const router = createAdminClientsRouter({ broadcast });
    const app = createContractApp({ mounts: [{ path: '/api/admin', router }] });

    // GET details (happy)
    const details = await request(app).get('/api/admin/client/acme').expect(200);
    expect(details.body).toEqual(
      expect.objectContaining({
        clientKey: 'acme',
        stats: expect.objectContaining({
          totalLeads: 2,
          totalCalls: 1,
          totalBookings: 2,
          conversionRate: '200.0',
        }),
        recentCalls: expect.any(Array),
      }),
    );

    // PUT 404
    await request(app).put('/api/admin/client/nope').send({ displayName: 'X' }).expect(404);
    // PUT happy
    await request(app).put('/api/admin/client/acme').send({ timezone: 'UTC' }).expect(200);
    expect(upsertFullClient).toHaveBeenCalled();

    // DELETE happy
    await request(app).delete('/api/admin/client/acme').expect(200);
    expect(deleteClient).toHaveBeenCalledWith('acme');

    // POST validation
    await request(app).post('/api/admin/client').send({}).expect(400);
    // POST happy
    await request(app)
      .post('/api/admin/client')
      .send({ businessName: 'New Biz', primaryService: 'Consulting', duration: 30 })
      .expect(200);
    expect(broadcast).toHaveBeenCalledWith('clients', { ok: true });

    // SEARCH validation + clients filtering
    await request(app).get('/api/admin/search').expect(400);
    const sr = await request(app).get('/api/admin/search?q=acme&type=clients').expect(200);
    expect(sr.body.clients).toHaveLength(1);
  });

  test('runtime-metrics: /api/health/detailed reports database unhealthy when query throws', async () => {
    const query = jest.fn(async () => {
      throw new Error('db down');
    });
    jest.unstable_mockModule('../../lib/backup-monitoring.js', () => ({
      verifyBackupSystem: jest.fn(async () => ({ status: 'info', message: 'ok', backupAge: 1, databaseAccessible: true, recentActivity: [], hasAnyData: true })),
    }));

    const { createRuntimeMetricsRouter } = await import('../../routes/runtime-metrics-mount.js');
    const router = createRuntimeMetricsRouter({
      query,
      cacheMiddleware: () => (_req, _res, next) => next(),
      dashboardStatsCache: { data: null, expires: 0 },
      DASHBOARD_CACHE_TTL: 1,
      getCallContextCacheStats: () => ({ size: 0 }),
      getMostRecentCallContext: () => null,
      GOOGLE_CLIENT_EMAIL: null,
      GOOGLE_PRIVATE_KEY: null,
      GOOGLE_CALENDAR_ID: null,
    });
    const app = createContractApp({ mounts: [{ path: '/', router }] });

    const res = await request(app).get('/api/health/detailed').expect(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        overall: expect.any(String),
        services: expect.objectContaining({
          database: expect.objectContaining({ status: 'unhealthy' }),
          backup: expect.objectContaining({ status: expect.any(String) }),
        }),
      }),
    );
  });

  test('runtime-metrics: /api/time/now returns 400 on unknown tenant and 200 on known tenant', async () => {
    const DateTime = {
      now: () => ({
        setZone: () => ({
          toUTC: () => ({
            toISO: () => 'utc',
            toMillis: () => 2,
            toSeconds: () => 2,
          }),
          toISO: () => 'tenant',
          toMillis: () => 1,
          toSeconds: () => 1,
          toFormat: () => 'fmt',
          year: 2026,
          month: 1,
          day: 1,
          weekday: 1,
          hour: 1,
          minute: 2,
          second: 3,
        }),
      }),
    };

    const { createRuntimeMetricsRouter } = await import('../../routes/runtime-metrics-mount.js');
    const router = createRuntimeMetricsRouter({
      getClientFromHeader: jest.fn(async (req) => (req.get('X-Client') ? { clientKey: 'c1' } : null)),
      pickTimezone: () => 'UTC',
      DateTime,
      cacheMiddleware: () => (_req, _res, next) => next(),
      dashboardStatsCache: { data: null, expires: 0 },
      DASHBOARD_CACHE_TTL: 1,
      getCallContextCacheStats: () => ({ size: 0 }),
      getMostRecentCallContext: () => null,
    });
    const app = createContractApp({ mounts: [{ path: '/', router }] });

    await request(app).get('/api/time/now').expect(400);
    const ok = await request(app).get('/api/time/now').set('X-Client', '1').expect(200);
    expect(ok.body).toEqual(expect.objectContaining({ ok: true, timezone: 'UTC' }));
  });
});

