import { describe, expect, test, jest, beforeEach, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';

import { createContractApp, withEnv } from '../helpers/contract-harness.js';

beforeEach(() => {
  jest.resetModules();
});

let batch1ConsoleErrorSpy;
beforeAll(() => {
  batch1ConsoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterAll(() => {
  batch1ConsoleErrorSpy.mockRestore();
});

describe('Batch1: high-risk route contracts (happy + failure)', () => {
  describe('routes/health.js', () => {
    test('happy: GET /healthz returns JSON', async () => {
      jest.unstable_mockModule('../../lib/health-check.js', () => ({
        performHealthCheck: jest.fn(async () => ({ status: 'healthy' })),
        quickHealthCheck: jest.fn(() => ({ ok: true })),
        readinessCheck: jest.fn(async () => ({ ready: true })),
        livenessCheck: jest.fn(() => ({ alive: true }))
      }));
      jest.unstable_mockModule('../../lib/structured-logger.js', () => ({ getLogger: () => ({ error: () => {} }) }));
      const { default: router } = await import('../../routes/health.js');
      const app = createContractApp({ mounts: [{ path: '/', router }] });
      const res = await request(app).get('/healthz').expect(200);
      expect(res.body).toEqual(expect.objectContaining({ ok: true }));
    });

    test('failure: GET /health returns 503 when performHealthCheck throws', async () => {
      jest.unstable_mockModule('../../lib/health-check.js', () => ({
        performHealthCheck: jest.fn(async () => {
          throw new Error('boom');
        }),
        quickHealthCheck: jest.fn(() => ({ ok: true })),
        readinessCheck: jest.fn(async () => ({ ready: true })),
        livenessCheck: jest.fn(() => ({ alive: true }))
      }));
      jest.unstable_mockModule('../../lib/structured-logger.js', () => ({ getLogger: () => ({ error: () => {} }) }));
      const { default: router } = await import('../../routes/health.js');
      const app = createContractApp({ mounts: [{ path: '/', router }] });
      const res = await request(app).get('/health').expect(503);
      expect(res.body).toEqual(expect.objectContaining({ status: 'unhealthy' }));
    });
  });

  describe('routes/health-and-diagnostics.js', () => {
    test('happy: GET /health/lb returns 200 when DB ok', async () => {
      const q = jest.fn(async () => ({ rows: [{ ok: 1 }] }));
      const { createHealthAndDiagnosticsRouter } = await import('../../routes/health-and-diagnostics.js');
      const app = createContractApp({ mounts: [{ path: '/', router: () => createHealthAndDiagnosticsRouter({ query: q }) }] });
      await request(app).get('/health/lb').expect(200);
    });

    test('failure: GET /health/lb returns 503 when DB unavailable', async () => {
      const q = jest.fn(async () => {
        throw new Error('db_down');
      });
      const { createHealthAndDiagnosticsRouter } = await import('../../routes/health-and-diagnostics.js');
      const app = createContractApp({ mounts: [{ path: '/', router: () => createHealthAndDiagnosticsRouter({ query: q }) }] });
      await request(app).get('/health/lb').expect(503);
    });
  });

  describe('routes/backend-status.js', () => {
    test('happy: GET /api/webhook-retry-stats returns ok true', async () => {
      jest.unstable_mockModule('../../lib/webhook-retry.js', () => ({
        getWebhookRetryStats: jest.fn(async () => ({ success: true, stats: [], summary: { total: 0 } }))
      }));
      jest.unstable_mockModule('../../middleware/security.js', () => ({
        authenticateApiKey: (_req, _res, next) => next()
      }));
      const { default: router } = await import('../../routes/backend-status.js');
      const app = createContractApp({ mounts: [{ path: '/', router }] });
      const res = await request(app).get('/api/webhook-retry-stats').expect(200);
      expect(res.body).toEqual(expect.objectContaining({ ok: true, stats: expect.any(Array) }));
    });

    test('failure: GET /api/migrations/status returns 401 without X-API-Key', async () => {
      jest.unstable_mockModule('../../middleware/security.js', () => ({
        authenticateApiKey: (_req, _res, next) => next()
      }));
      const { default: router } = await import('../../routes/backend-status.js');
      const app = createContractApp({ mounts: [{ path: '/', router }] });
      await withEnv({ API_KEY: 'secret' }, async () => {
        await request(app).get('/api/migrations/status').expect(401);
      });
    });
  });

  describe('routes/api-docs.js', () => {
    test('happy: GET /api-docs?format=json returns docs JSON', async () => {
      jest.unstable_mockModule('../../lib/api-documentation.js', () => ({
        generateApiDocs: () => ({ ok: true, openapi: '3.0.0' })
      }));
      const { createApiDocsRouter } = await import('../../routes/api-docs.js');
      const app = createContractApp({ mounts: [{ path: '/', router: () => createApiDocsRouter() }] });
      const res = await request(app).get('/api-docs?format=json').expect(200);
      expect(res.body).toEqual(expect.objectContaining({ ok: true, openapi: '3.0.0' }));
    });

    test('failure: returns 500 when docs generator throws', async () => {
      jest.unstable_mockModule('../../lib/api-documentation.js', () => ({
        generateApiDocs: () => {
          throw new Error('nope');
        }
      }));
      const { createApiDocsRouter } = await import('../../routes/api-docs.js');
      const app = createContractApp({ mounts: [{ path: '/', router: () => createApiDocsRouter() }] });
      const res = await request(app).get('/api-docs?format=json').expect(500);
      expect(res.body).toEqual(expect.objectContaining({ error: expect.any(String) }));
    });
  });

  describe('routes/industry-comparison.js', () => {
    test('happy: returns ok true with no data message when no calls', async () => {
      jest.unstable_mockModule('../../db.js', () => ({
        getCallQualityMetrics: jest.fn(async () => ({ total_calls: 0 }))
      }));
      const { createIndustryComparisonRouter } = await import('../../routes/industry-comparison.js');
      const app = createContractApp({
        mounts: [
          {
            path: '/',
            router: () => createIndustryComparisonRouter({ getFullClient: async () => ({ industry: 'default' }) })
          }
        ]
      });
      const res = await request(app).get('/industry-comparison/c1').expect(200);
      expect(res.body).toEqual(expect.objectContaining({ ok: true }));
    });

    test('failure: 404 when client not found', async () => {
      jest.unstable_mockModule('../../db.js', () => ({
        getCallQualityMetrics: jest.fn(async () => ({ total_calls: 0 }))
      }));
      const { createIndustryComparisonRouter } = await import('../../routes/industry-comparison.js');
      const app = createContractApp({ mounts: [{ path: '/', router: () => createIndustryComparisonRouter({ getFullClient: async () => null }) }] });
      await request(app).get('/industry-comparison/missing').expect(404);
    });
  });

  describe('routes/roi.js', () => {
    test('happy: GET /roi/:clientKey returns ok true', async () => {
      jest.unstable_mockModule('../../lib/roi-calculator.js', () => ({
        calculateROI: jest.fn(async () => ({ clientKey: 'c1', totalCost: 1 })),
        projectROI: jest.fn(() => ({ projected: true }))
      }));
      const { createRoiRouter } = await import('../../routes/roi.js');
      const app = createContractApp({ mounts: [{ path: '/', router: () => createRoiRouter() }] });
      const res = await request(app).get('/roi/c1').expect(200);
      expect(res.body).toEqual(expect.objectContaining({ ok: true, projection: expect.any(Object) }));
    });

    test('failure: returns 500 when calculateROI throws', async () => {
      jest.unstable_mockModule('../../lib/roi-calculator.js', () => ({
        calculateROI: jest.fn(async () => {
          throw new Error('fail');
        }),
        projectROI: jest.fn(() => ({}))
      }));
      const { createRoiRouter } = await import('../../routes/roi.js');
      const app = createContractApp({ mounts: [{ path: '/', router: () => createRoiRouter() }] });
      await request(app).get('/roi/c1').expect(500);
    });
  });

  describe('routes/pipeline-tracking.js', () => {
    test('happy: GET /pipeline-stats returns computed stats when pipeline present', async () => {
      const { createPipelineTrackingRouter } = await import('../../routes/pipeline-tracking.js');
      const app = createContractApp({
        mounts: [
          {
            path: '/',
            router: () =>
              createPipelineTrackingRouter({
                smsEmailPipeline: { getStats: () => ({ totalLeads: 10 }), pendingLeads: new Map() }
              })
          }
        ]
      });
      const res = await request(app).get('/pipeline-stats').expect(200);
      expect(res.body).toEqual(expect.objectContaining({ totalLeads: 10, lastUpdated: expect.any(String) }));
    });

    test('failure: GET /pipeline-stats returns safe defaults when pipeline missing', async () => {
      const { createPipelineTrackingRouter } = await import('../../routes/pipeline-tracking.js');
      const app = createContractApp({ mounts: [{ path: '/', router: () => createPipelineTrackingRouter({}) }] });
      const res = await request(app).get('/pipeline-stats').expect(200);
      expect(res.body).toEqual(expect.objectContaining({ totalLeads: 0, conversionRate: 0 }));
    });
  });

  describe('routes/pipeline-retry.js', () => {
    test('happy: POST /trigger-retry/:leadId returns success when lead waiting_for_email', async () => {
      const pendingLeads = new Map([['1', { status: 'waiting_for_email', phoneNumber: '+447700900000' }]]);
      const smsEmailPipeline = { pendingLeads, processRetries: jest.fn(async () => {}) };
      const { createPipelineRetryRouter } = await import('../../routes/pipeline-retry.js');
      const app = createContractApp({ mounts: [{ path: '/', router: () => createPipelineRetryRouter({ smsEmailPipeline }) }] });
      const res = await request(app).post('/trigger-retry/1').expect(200);
      expect(res.body).toEqual(expect.objectContaining({ success: true, leadId: '1' }));
    });

    test('failure: returns 500 when smsEmailPipeline missing', async () => {
      const { createPipelineRetryRouter } = await import('../../routes/pipeline-retry.js');
      const app = createContractApp({ mounts: [{ path: '/', router: () => createPipelineRetryRouter({}) }] });
      await request(app).post('/trigger-retry/1').expect(500);
    });
  });

  describe('routes/booking-test.js', () => {
    test('happy: GET /test-booking returns success true', async () => {
      const bookingSystem = {
        generateTimeSlots: () => [{ start: 'x' }, { start: 'y' }, { start: 'z' }, { start: 'w' }],
        bookDemo: jest.fn(async () => ({ ok: true }))
      };
      const { createBookingTestRouter } = await import('../../routes/booking-test.js');
      const app = createContractApp({ mounts: [{ path: '/', router: () => createBookingTestRouter({ bookingSystem }) }] });
      const res = await request(app).get('/test-booking').expect(200);
      expect(res.body).toEqual(expect.objectContaining({ success: true, availableSlots: 4 }));
    });

    test('happy: GET /test-booking-calendar returns result', async () => {
      const bookingSystem = {
        testCalendarConnection: jest.fn(async () => ({ ok: true }))
      };
      const { createBookingTestRouter } = await import('../../routes/booking-test.js');
      const app = createContractApp({ mounts: [{ path: '/', router: () => createBookingTestRouter({ bookingSystem }) }] });
      const res = await request(app).get('/test-booking-calendar').expect(200);
      expect(res.body).toEqual(expect.objectContaining({ ok: true }));
      expect(bookingSystem.testCalendarConnection).toHaveBeenCalled();
    });

    test('failure: POST /test-calendar-booking returns 401 without X-API-Key', async () => {
      const { createBookingTestRouter } = await import('../../routes/booking-test.js');
      const app = createContractApp({
        mounts: [
          {
            path: '/',
            router: () =>
              createBookingTestRouter({
                getApiKey: () => 'secret',
                getFullClient: async () => ({ booking: {} })
              })
          }
        ]
      });
      await request(app).post('/test-calendar-booking').send({ tenantKey: 't1', leadPhone: '+44', appointmentTime: 'x' }).expect(401);
    });

    test('failure: returns 500 when bookingSystem throws', async () => {
      const bookingSystem = {
        generateTimeSlots: () => [{ start: 'x' }],
        bookDemo: jest.fn(async () => {
          throw new Error('fail');
        })
      };
      const { createBookingTestRouter } = await import('../../routes/booking-test.js');
      const app = createContractApp({ mounts: [{ path: '/', router: () => createBookingTestRouter({ bookingSystem }) }] });
      await request(app).get('/test-booking').expect(500);
    });
  });

  describe('routes/google-places-test.js', () => {
    test('happy: POST /test-google-places returns success when key configured', async () => {
      const fetchMock = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) }));
      global.fetch = fetchMock;
      globalThis.fetch = fetchMock;
      expect(globalThis.fetch).toBe(fetchMock);
      const { createGooglePlacesTestRouter } = await import('../../routes/google-places-test.js');
      const app = createContractApp({ mounts: [{ path: '/', router: () => createGooglePlacesTestRouter() }] });
      await withEnv({ GOOGLE_PLACES_API_KEY: 'abc1234567890' }, async () => {
        const res = await request(app).post('/test-google-places');
        // If this ever fails again, keep the body visible in Jest output.
        if (res.status !== 200) {
          // eslint-disable-next-line no-console
          console.log('google-places-test unexpected response', { status: res.status, body: res.body });
        }
        expect(res.status).toBe(200);
        expect(res.body).toEqual(expect.objectContaining({ success: true, testQuery: expect.any(String) }));
        expect(fetchMock).toHaveBeenCalled();
      });
    });

    test('failure: returns 500 when key missing', async () => {
      const { createGooglePlacesTestRouter } = await import('../../routes/google-places-test.js');
      const app = createContractApp({ mounts: [{ path: '/', router: () => createGooglePlacesTestRouter() }] });
      await withEnv({ GOOGLE_PLACES_API_KEY: undefined }, async () => {
        await request(app).post('/test-google-places').expect(500);
      });
    });
  });

  describe('routes/quality-alerts.js', () => {
    test('happy: GET /quality-alerts/:clientKey returns ok true', async () => {
      jest.unstable_mockModule('../../db.js', () => ({
        getQualityAlerts: jest.fn(async () => [{ id: 1, alert_type: 'x' }]),
        resolveQualityAlert: jest.fn(async () => {})
      }));
      const { createQualityAlertsRouter } = await import('../../routes/quality-alerts.js');
      const app = createContractApp({ mounts: [{ path: '/', router: () => createQualityAlertsRouter() }] });
      const res = await request(app).get('/quality-alerts/c1').expect(200);
      expect(res.body).toEqual(expect.objectContaining({ ok: true, alerts: expect.any(Array) }));
    });

    test('failure: returns 500 when getQualityAlerts throws', async () => {
      jest.unstable_mockModule('../../db.js', () => ({
        getQualityAlerts: jest.fn(async () => {
          throw new Error('fail');
        }),
        resolveQualityAlert: jest.fn(async () => {})
      }));
      const { createQualityAlertsRouter } = await import('../../routes/quality-alerts.js');
      const app = createContractApp({ mounts: [{ path: '/', router: () => createQualityAlertsRouter() }] });
      await request(app).get('/quality-alerts/c1').expect(500);
    });
  });

  describe('routes/quick-win-metrics.js', () => {
    test('happy: GET /sms-delivery-rate/:clientKey returns ok true', async () => {
      const q = jest.fn(async () => ({ rows: [{ total: 10, delivered: 10, failed: 0, sent: 0, queued: 0 }] }));
      const cacheMiddleware = () => (_req, _res, next) => next();
      const { createQuickWinMetricsRouter } = await import('../../routes/quick-win-metrics.js');
      const app = createContractApp({
        mounts: [{ path: '/', router: () => createQuickWinMetricsRouter({ query: q, cacheMiddleware }) }]
      });
      const res = await request(app).get('/sms-delivery-rate/c1?days=7').expect(200);
      expect(res.body).toEqual(expect.objectContaining({ ok: true, clientKey: 'c1' }));
    });

    test('failure: returns 500 when query throws', async () => {
      const q = jest.fn(async () => {
        throw new Error('db down');
      });
      const cacheMiddleware = () => (_req, _res, next) => next();
      const { createQuickWinMetricsRouter } = await import('../../routes/quick-win-metrics.js');
      const app = createContractApp({
        mounts: [{ path: '/', router: () => createQuickWinMetricsRouter({ query: q, cacheMiddleware }) }]
      });
      await request(app).get('/sms-delivery-rate/c1?days=7').expect(500);
    });
  });

  describe('routes/ops.js', () => {
    test('happy: GET /api/rate-limit/status returns ok true', async () => {
      jest.unstable_mockModule('../../lib/rate-limiting.js', () => ({
        getRateLimitStatus: jest.fn(async () => ({ limit: 1 })),
        getRateLimitStats: jest.fn(() => ({ ok: true }))
      }));
      jest.unstable_mockModule('../../lib/cache.js', () => ({
        cacheMiddleware: () => (_req, _res, next) => next(),
        getCache: () => ({ getStats: () => ({ ok: true }), clear: () => {} })
      }));
      jest.unstable_mockModule('../../lib/performance-monitor.js', () => ({
        getPerformanceMonitor: () => ({ getStats: () => ({ ok: true }), generateReport: () => ({ ok: true }) })
      }));
      jest.unstable_mockModule('../../db.js', () => ({ query: jest.fn(async () => ({ rows: [{ count: 0 }] })) }));
      const { default: router } = await import('../../routes/ops.js');
      const app = createContractApp({ mounts: [{ path: '/', router }] });
      const res = await request(app).get('/api/rate-limit/status').expect(200);
      expect(res.body).toEqual(expect.objectContaining({ ok: true, limits: expect.any(Object) }));
    });

    test('failure: GET /api/performance/queries/stats returns 500 when stats is null', async () => {
      jest.unstable_mockModule('../../lib/query-performance-tracker.js', () => ({
        getQueryPerformanceStats: jest.fn(async () => null),
        getSlowQueries: jest.fn(async () => []),
        getOptimizationRecommendations: jest.fn(async () => [])
      }));
      jest.unstable_mockModule('../../lib/cache.js', () => ({
        cacheMiddleware: () => (_req, _res, next) => next(),
        getCache: () => ({ getStats: () => ({ ok: true }), clear: () => {} })
      }));
      jest.unstable_mockModule('../../lib/performance-monitor.js', () => ({
        getPerformanceMonitor: () => ({ getStats: () => ({ ok: true }), generateReport: () => ({ ok: true }) })
      }));
      jest.unstable_mockModule('../../lib/rate-limiting.js', () => ({
        getRateLimitStatus: jest.fn(async () => ({ limit: 1 })),
        getRateLimitStats: jest.fn(() => ({ ok: true }))
      }));
      jest.unstable_mockModule('../../db.js', () => ({ query: jest.fn(async () => ({ rows: [{ count: 0 }] })) }));
      const { default: router } = await import('../../routes/ops.js');
      const app = createContractApp({ mounts: [{ path: '/', router }] });
      await request(app).get('/api/performance/queries/stats').expect(500);
    });
  });

  describe('routes/monitoring.js', () => {
    test('happy: GET /api/monitoring/metrics returns metrics', async () => {
      jest.unstable_mockModule('../../lib/performance-monitor.js', () => ({
        getPerformanceMonitor: () => ({ getStats: () => ({ ok: true }) })
      }));
      jest.unstable_mockModule('../../lib/cache.js', () => ({ getCache: () => ({ getStats: () => ({ ok: true }) }) }));
      jest.unstable_mockModule('../../lib/structured-logger.js', () => ({ getLogger: () => ({ error: () => {} }) }));
      jest.unstable_mockModule('../../db.js', () => ({ query: jest.fn(async () => ({ rows: [{ total_tenants: 1 }] })) }));
      const { default: router } = await import('../../routes/monitoring.js');
      const app = createContractApp({ mounts: [{ path: '/', router }] });
      const res = await request(app).get('/api/monitoring/metrics').expect(200);
      expect(res.body).toEqual(expect.objectContaining({ performance: expect.any(Object) }));
    });

    test('failure: GET /api/monitoring/database-stats returns 500 when query throws', async () => {
      jest.unstable_mockModule('../../lib/performance-monitor.js', () => ({
        getPerformanceMonitor: () => ({ getStats: () => ({ ok: true }) })
      }));
      jest.unstable_mockModule('../../lib/cache.js', () => ({ getCache: () => ({ getStats: () => ({ ok: true }) }) }));
      jest.unstable_mockModule('../../lib/structured-logger.js', () => ({ getLogger: () => ({ error: () => {} }) }));
      jest.unstable_mockModule('../../db.js', () => ({
        query: jest.fn(async () => {
          throw new Error('db');
        })
      }));
      const { default: router } = await import('../../routes/monitoring.js');
      const app = createContractApp({ mounts: [{ path: '/', router }] });
      await request(app).get('/api/monitoring/database-stats').expect(500);
    });
  });
});

