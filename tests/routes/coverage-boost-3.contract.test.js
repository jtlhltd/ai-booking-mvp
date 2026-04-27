/**
 * Coverage boost batch 3 — happy + failure pair per route to lift branches/lines
 * on the previously-low-coverage modules listed in the plan.
 */
import { describe, expect, test, jest, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';

import { createContractApp } from '../helpers/contract-harness.js';

let consoleErrSpy;
let consoleLogSpy;
beforeAll(() => {
  consoleErrSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterAll(() => {
  consoleErrSpy.mockRestore();
  consoleLogSpy.mockRestore();
});

beforeEach(() => { jest.resetModules(); });

// ------------------------------------------------------------------
// routes/dev-test-mount.js
// ------------------------------------------------------------------
describe('routes/dev-test-mount', () => {
  test('GET /api/test reports env presence flags', async () => {
    const { createDevTestRouter } = await import('../../routes/dev-test-mount.js');
    const app = createContractApp({
      mounts: [{ path: '/', router: () => createDevTestRouter({
        query: jest.fn(),
        readJson: jest.fn(),
        writeJson: jest.fn(),
        SMS_STATUS_PATH: '/tmp/x.json'
      }) }]
    });
    const res = await request(app).get('/api/test').expect(200);
    expect(res.body).toEqual(expect.objectContaining({
      success: true,
      env: expect.objectContaining({
        googlePlaces: expect.stringMatching(/SET|NOT SET/),
        companiesHouse: expect.stringMatching(/SET|NOT SET/),
        googleSearch: expect.stringMatching(/SET|NOT SET/)
      })
    }));
  });

  test('POST /api/test/sms-status-webhook writes status row and returns OK', async () => {
    const writeJson = jest.fn(async () => {});
    const readJson = jest.fn(async () => []);
    const query = jest.fn(async () => ({ rows: [] }));
    const { createDevTestRouter } = await import('../../routes/dev-test-mount.js');
    const app = createContractApp({
      mounts: [{ path: '/', router: () => createDevTestRouter({
        query, readJson, writeJson, SMS_STATUS_PATH: '/tmp/sms.json'
      }) }]
    });
    const res = await request(app)
      .post('/api/test/sms-status-webhook')
      .send({ MessageSid: 'SM1', MessageStatus: 'delivered', To: '+44', From: '+1' })
      .expect(200);
    expect(res.text).toBe('OK');
    expect(query).toHaveBeenCalledWith(expect.stringContaining('UPDATE messages'), ['delivered', 'SM1']);
    expect(writeJson).toHaveBeenCalledWith('/tmp/sms.json', expect.any(Array));
  });
});

// ------------------------------------------------------------------
// routes/runtime-metrics-mount.js
// ------------------------------------------------------------------
describe('routes/runtime-metrics-mount', () => {
  function buildDeps(overrides = {}) {
    return {
      query: jest.fn(async () => ({ rows: [] })),
      listFullClients: jest.fn(async () => []),
      getFullClient: jest.fn(async () => null),
      cacheMiddleware: () => (_req, _res, next) => next(),
      dashboardStatsCache: new Map(),
      DASHBOARD_CACHE_TTL: 60000,
      AIInsightsEngine: class { async generate() { return {}; } },
      getClientFromHeader: async () => ({ clientKey: 't1' }),
      pickTimezone: () => 'Europe/London',
      DateTime: { now: () => ({ setZone: () => ({ toUTC: () => ({ toISO: () => 'iso' }), toISO: () => 'iso', toMillis: () => 0, toSeconds: () => 0, toFormat: () => 'fmt', year: 2024, month: 1, day: 1, weekday: 1, hour: 0, minute: 0, second: 0 }) }) },
      getCallContextCacheStats: () => ({ size: 0 }),
      getMostRecentCallContext: () => null,
      GOOGLE_CLIENT_EMAIL: '',
      GOOGLE_PRIVATE_KEY: '',
      GOOGLE_CALENDAR_ID: '',
      ...overrides
    };
  }

  test('GET /api/build returns commit/serviceId fingerprint', async () => {
    const { createRuntimeMetricsRouter } = await import('../../routes/runtime-metrics-mount.js');
    const app = createContractApp({
      mounts: [{ path: '/', router: () => createRuntimeMetricsRouter(buildDeps()) }]
    });
    const res = await request(app).get('/api/build').expect(200);
    expect(res.body).toEqual(expect.objectContaining({ ok: true }));
    expect(res.body).toHaveProperty('commit');
    expect(res.body).toHaveProperty('serviceId');
  });

  test('GET /api/health/detailed reports DB unhealthy when query throws', async () => {
    const { createRuntimeMetricsRouter } = await import('../../routes/runtime-metrics-mount.js');
    const app = createContractApp({
      mounts: [{ path: '/', router: () => createRuntimeMetricsRouter(buildDeps({ query: jest.fn(async () => { throw new Error('db'); }) })) }]
    });
    const res = await request(app).get('/api/health/detailed').expect(200);
    expect(res.body.services.database).toEqual(expect.objectContaining({ status: 'unhealthy', error: 'db' }));
    expect(res.body).toHaveProperty('overall');
  });

  test('GET /api/debug/cache returns cache stats', async () => {
    const { createRuntimeMetricsRouter } = await import('../../routes/runtime-metrics-mount.js');
    const app = createContractApp({
      mounts: [{ path: '/', router: () => createRuntimeMetricsRouter(buildDeps({
        getCallContextCacheStats: () => ({ size: 3 }),
        getMostRecentCallContext: () => ({ callId: 'X' })
      })) }]
    });
    const res = await request(app).get('/api/debug/cache').expect(200);
    expect(res.body).toEqual(expect.objectContaining({
      stats: { size: 3 },
      recentForLogisticsClient: { callId: 'X' }
    }));
  });
});

// ------------------------------------------------------------------
// routes/client-ops-mount.js (auth gate paths)
// ------------------------------------------------------------------
describe('routes/client-ops-mount auth gates', () => {
  function buildDeps(overrides = {}) {
    return {
      getFullClient: async () => null,
      nanoid: () => 'id',
      createABTestExperiment: jest.fn(),
      invalidateClientCache: jest.fn(),
      runOutboundAbTestSetup: jest.fn(async (_k, _b, res) => res.json({ ok: true, ran: 'setup' })),
      runOutboundAbChallengerUpdate: jest.fn(async (_k, _b, res) => res.json({ ok: true, ran: 'challenger' })),
      runOutboundAbDimensionStop: jest.fn(async (_k, _d, res) => res.json({ ok: true, ran: 'stop' })),
      isDashboardSelfServiceClient: () => false,
      isVapiOutboundAbExperimentOnlyPatch: () => false,
      ...overrides
    };
  }

  test('POST /api/onboard-client returns 401 without API key', async () => {
    const { createClientOpsRouter } = await import('../../routes/client-ops-mount.js');
    const app = createContractApp({
      mounts: [{ path: '/', router: () => createClientOpsRouter(buildDeps()) }]
    });
    const res = await request(app).post('/api/onboard-client').send({}).expect(401);
    expect(res.body.error).toBe('Unauthorized');
  });

  test('POST /api/clients/:k/outbound-ab-test allows self-service client without API key', async () => {
    const runOutboundAbTestSetup = jest.fn(async (_k, _b, res) => res.json({ ok: true, ran: 'setup' }));
    const { createClientOpsRouter } = await import('../../routes/client-ops-mount.js');
    const app = createContractApp({
      mounts: [{ path: '/', router: () => createClientOpsRouter(buildDeps({
        isDashboardSelfServiceClient: () => true,
        runOutboundAbTestSetup
      })) }]
    });
    const res = await request(app).post('/api/clients/dashboard/outbound-ab-test').send({ x: 1 }).expect(200);
    expect(res.body).toEqual({ ok: true, ran: 'setup' });
    expect(runOutboundAbTestSetup).toHaveBeenCalled();
  });

  test('PATCH /api/clients/:k/outbound-ab-challenger 401 when neither api key nor self-service', async () => {
    const { createClientOpsRouter } = await import('../../routes/client-ops-mount.js');
    const app = createContractApp({
      mounts: [{ path: '/', router: () => createClientOpsRouter(buildDeps()) }]
    });
    const res = await request(app).patch('/api/clients/x/outbound-ab-challenger').send({}).expect(401);
    expect(res.body.ok).toBe(false);
  });

  test('DELETE /api/clients/:k/outbound-ab-dimension/:d invokes stop helper for valid auth', async () => {
    const runOutboundAbDimensionStop = jest.fn(async (_k, dim, res) => res.json({ ok: true, dim }));
    const { createClientOpsRouter } = await import('../../routes/client-ops-mount.js');
    const app = createContractApp({
      mounts: [{ path: '/', router: () => createClientOpsRouter(buildDeps({
        isDashboardSelfServiceClient: () => true,
        runOutboundAbDimensionStop
      })) }]
    });
    const res = await request(app).delete('/api/clients/x/outbound-ab-dimension/Industry').expect(200);
    expect(res.body).toEqual({ ok: true, dim: 'industry' });
  });
});

// ------------------------------------------------------------------
// routes/quick-win-metrics.js
// ------------------------------------------------------------------
describe('routes/quick-win-metrics', () => {
  test('GET /sms-delivery-rate/:clientKey returns rate + isHealthy=true when no data', async () => {
    const query = jest.fn(async () => ({ rows: [{ total: 0, delivered: 0, failed: 0, sent: 0, queued: 0 }] }));
    const { createQuickWinMetricsRouter } = await import('../../routes/quick-win-metrics.js');
    const app = createContractApp({
      mounts: [{ path: '/', router: () => createQuickWinMetricsRouter({
        query, cacheMiddleware: () => (_req, _res, next) => next()
      }) }]
    });
    const res = await request(app).get('/sms-delivery-rate/acme').expect(200);
    expect(res.body).toEqual(expect.objectContaining({
      ok: true,
      clientKey: 'acme',
      total: 0,
      deliveryRate: '0%'
    }));
  });

  test('GET /sms-delivery-rate/:clientKey 500 when query throws', async () => {
    const query = jest.fn(async () => { throw new Error('boom'); });
    const { createQuickWinMetricsRouter } = await import('../../routes/quick-win-metrics.js');
    const app = createContractApp({
      mounts: [{ path: '/', router: () => createQuickWinMetricsRouter({
        query, cacheMiddleware: () => (_req, _res, next) => next()
      }) }]
    });
    const res = await request(app).get('/sms-delivery-rate/acme').expect(500);
    expect(res.body.ok).toBe(false);
  });

  test('GET /calendar-sync/:clientKey returns connection summary', async () => {
    const query = jest.fn(async (sql) => {
      const s = String(sql);
      if (s.includes('FROM tenants')) return { rows: [{ calendar_json: { service_account_email: 'x@y' } }] };
      if (s.includes('MAX(created_at)')) return { rows: [{ last_sync: null }] };
      return { rows: [{ count: 0 }] };
    });
    const { createQuickWinMetricsRouter } = await import('../../routes/quick-win-metrics.js');
    const app = createContractApp({
      mounts: [{ path: '/', router: () => createQuickWinMetricsRouter({
        query, cacheMiddleware: () => (_req, _res, next) => next()
      }) }]
    });
    const res = await request(app).get('/calendar-sync/acme').expect(200);
    expect(res.body).toEqual(expect.objectContaining({
      ok: true,
      connected: true,
      status: 'synced'
    }));
  });
});

// ------------------------------------------------------------------
// routes/pipeline-tracking.js
// ------------------------------------------------------------------
describe('routes/pipeline-tracking', () => {
  test('GET /pipeline-stats returns zeros when smsEmailPipeline missing', async () => {
    const { createPipelineTrackingRouter } = await import('../../routes/pipeline-tracking.js');
    const app = createContractApp({
      mounts: [{ path: '/', router: () => createPipelineTrackingRouter({}) }]
    });
    const res = await request(app).get('/pipeline-stats').expect(200);
    expect(res.body).toEqual({
      totalLeads: 0,
      waitingForEmail: 0,
      emailReceived: 0,
      booked: 0,
      conversionRate: 0
    });
  });

  test('GET /pipeline-stats returns pipeline.getStats() with lastUpdated when configured', async () => {
    const smsEmailPipeline = {
      pendingLeads: new Map(),
      getStats: jest.fn(() => ({ totalLeads: 5, waitingForEmail: 2 })),
      getLeadsNeedingAttention: jest.fn(() => ({ stuckLeads: [], expiredLeads: [], retryScheduled: [] }))
    };
    const { createPipelineTrackingRouter } = await import('../../routes/pipeline-tracking.js');
    const app = createContractApp({
      mounts: [{ path: '/', router: () => createPipelineTrackingRouter({ smsEmailPipeline }) }]
    });
    const res = await request(app).get('/pipeline-stats').expect(200);
    expect(res.body).toEqual(expect.objectContaining({ totalLeads: 5, waitingForEmail: 2, lastUpdated: expect.any(String) }));
  });

  test('GET /recent-leads returns sorted lead list (most-recent first)', async () => {
    const map = new Map();
    map.set('a', { id: 'a', status: 'pending', createdAt: '2024-01-01T00:00:00Z' });
    map.set('b', { id: 'b', status: 'pending', createdAt: '2024-01-02T00:00:00Z' });
    const { createPipelineTrackingRouter } = await import('../../routes/pipeline-tracking.js');
    const app = createContractApp({
      mounts: [{ path: '/', router: () => createPipelineTrackingRouter({
        smsEmailPipeline: {
          pendingLeads: map,
          getStats: () => ({}),
          getLeadsNeedingAttention: () => ({ stuckLeads: [], expiredLeads: [], retryScheduled: [] })
        }
      }) }]
    });
    const res = await request(app).get('/recent-leads').expect(200);
    expect(res.body[0].id).toBe('b');
  });

  test('GET /leads-needing-attention 500 when pipeline.getLeadsNeedingAttention throws', async () => {
    const { createPipelineTrackingRouter } = await import('../../routes/pipeline-tracking.js');
    const app = createContractApp({
      mounts: [{ path: '/', router: () => createPipelineTrackingRouter({
        smsEmailPipeline: { pendingLeads: new Map(), getStats: () => ({}), getLeadsNeedingAttention: () => { throw new Error('x'); } }
      }) }]
    });
    const res = await request(app).get('/leads-needing-attention').expect(500);
    expect(res.body.error).toBe('Failed to get leads needing attention');
  });
});

// ------------------------------------------------------------------
// routes/crm.js
// ------------------------------------------------------------------
describe('routes/crm', () => {
  test('POST /hubspot/sync 400 when fields missing', async () => {
    const { createCrmRouter } = await import('../../routes/crm.js');
    const app = createContractApp({
      mounts: [{ path: '/api/crm', router: () => createCrmRouter({ getFullClient: async () => null }) }]
    });
    const res = await request(app).post('/api/crm/hubspot/sync').send({}).expect(400);
    expect(res.body.error).toMatch(/clientKey and hubspotApiKey/);
  });

  test('POST /hubspot/sync 404 when client not found', async () => {
    const { createCrmRouter } = await import('../../routes/crm.js');
    const app = createContractApp({
      mounts: [{ path: '/api/crm', router: () => createCrmRouter({ getFullClient: async () => null }) }]
    });
    const res = await request(app)
      .post('/api/crm/hubspot/sync')
      .send({ clientKey: 'acme', hubspotApiKey: 'k' })
      .expect(404);
    expect(res.body.error).toBe('Client not found');
  });

  test('POST /salesforce/sync 400 when missing credentials', async () => {
    const { createCrmRouter } = await import('../../routes/crm.js');
    const app = createContractApp({
      mounts: [{ path: '/api/crm', router: () => createCrmRouter({ getFullClient: async () => null }) }]
    });
    const res = await request(app).post('/api/crm/salesforce/sync').send({ clientKey: 'acme' }).expect(400);
    expect(res.body.error).toMatch(/clientKey and salesforceCredentials/);
  });

  test('GET /integrations/:clientKey 404 when client missing', async () => {
    const { createCrmRouter } = await import('../../routes/crm.js');
    const app = createContractApp({
      mounts: [{ path: '/api/crm', router: () => createCrmRouter({ getFullClient: async () => null }) }]
    });
    await request(app).get('/api/crm/integrations/missing').expect(404);
  });
});

// ------------------------------------------------------------------
// routes/demo-setup.js (default-export router; uses real db.js import)
// ------------------------------------------------------------------
describe('routes/demo-setup', () => {
  async function loadRouter(query) {
    jest.unstable_mockModule('../../db.js', () => ({ query }));
    const mod = await import('../../routes/demo-setup.js');
    return mod.default;
  }

  test('GET /check-db 200 returns tenants list and sets no-cache headers', async () => {
    const query = jest.fn(async () => ({ rows: [{ client_key: 'a', display_name: 'A' }] }));
    const router = await loadRouter(query);
    const app = createContractApp({ mounts: [{ path: '/', router }] });
    const res = await request(app).get('/check-db').expect(200);
    expect(res.headers['cache-control']).toMatch(/no-store/);
    expect(res.body).toEqual({ success: true, tenants: [{ client_key: 'a', display_name: 'A' }] });
  });

  test('GET /check-db 500 on db error', async () => {
    const query = jest.fn(async () => { throw new Error('boom'); });
    const router = await loadRouter(query);
    const app = createContractApp({ mounts: [{ path: '/', router }] });
    const res = await request(app).get('/check-db').expect(500);
    expect(res.body.success).toBe(false);
  });

  test('GET /clear-my-leads 200 reports rows cleared', async () => {
    const query = jest.fn(async () => ({ rowCount: 7 }));
    const router = await loadRouter(query);
    const app = createContractApp({ mounts: [{ path: '/', router }] });
    const res = await request(app).get('/clear-my-leads').expect(200);
    expect(res.body).toEqual(expect.objectContaining({ success: true, cleared: 7 }));
  });
});
