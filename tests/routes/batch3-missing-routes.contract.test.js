import { describe, expect, test, jest, beforeEach, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';

import { createContractApp, withEnv } from '../helpers/contract-harness.js';

beforeEach(() => {
  jest.resetModules();
});

let batch3ConsoleSpy;
beforeAll(() => {
  batch3ConsoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterAll(() => {
  batch3ConsoleSpy.mockRestore();
});

describe('Batch3: routes missing from path-string inventory (happy + failure)', () => {
  describe('routes/analytics.js', () => {
    test('happy: POST /score-leads returns scored leads', async () => {
      jest.unstable_mockModule('../../db.js', () => ({
        query: jest.fn(async () => ({
          rows: [
            {
              phone: '+441',
              name: 'A',
              answered_count: 1,
              call_count: 2,
              max_duration: 60,
              last_contacted_at: null
            }
          ]
        }))
      }));
      jest.unstable_mockModule('../../lib/analytics-tracker.js', () => ({
        calculateLeadScore: jest.fn(() => 55)
      }));
      const { createAnalyticsRouter } = await import('../../routes/analytics.js');
      const app = createContractApp({ mounts: [{ path: '/', router: () => createAnalyticsRouter() }] });
      const res = await request(app).post('/score-leads?clientKey=c1').send({}).expect(200);
      expect(res.body).toEqual(expect.objectContaining({ ok: true, leads: expect.any(Array) }));
    });

    test('failure: POST /score-leads without clientKey returns 400', async () => {
      const { createAnalyticsRouter } = await import('../../routes/analytics.js');
      const app = createContractApp({ mounts: [{ path: '/', router: () => createAnalyticsRouter() }] });
      await request(app).post('/score-leads').send({}).expect(400);
    });
  });

  describe('routes/branding.js', () => {
    test('happy: GET /:clientKey returns branding', async () => {
      jest.unstable_mockModule('../../lib/whitelabel.js', () => ({
        getClientBranding: jest.fn(() => ({ logo: 'x' })),
        validateBranding: jest.fn(() => ({ valid: true, errors: [] }))
      }));
      const { createBrandingRouter } = await import('../../routes/branding.js');
      const app = createContractApp({
        mounts: [
          {
            path: '/',
            router: () =>
              createBrandingRouter({
                getFullClient: async () => ({ clientKey: 'c1', branding: {} }),
                upsertFullClient: async () => {}
              })
          }
        ]
      });
      const res = await request(app).get('/c1').expect(200);
      expect(res.body).toEqual(expect.objectContaining({ ok: true, branding: { logo: 'x' } }));
    });

    test('failure: GET /:clientKey returns 404 when client missing', async () => {
      jest.unstable_mockModule('../../lib/whitelabel.js', () => ({
        getClientBranding: jest.fn(() => ({})),
        validateBranding: jest.fn(() => ({ valid: true, errors: [] }))
      }));
      const { createBrandingRouter } = await import('../../routes/branding.js');
      const app = createContractApp({
        mounts: [{ path: '/', router: () => createBrandingRouter({ getFullClient: async () => null, upsertFullClient: async () => {} }) }]
      });
      await request(app).get('/missing').expect(404);
    });
  });

  describe('routes/clients.js', () => {
    test('happy: GET /:clientKey returns client payload', async () => {
      jest.unstable_mockModule('../../middleware/security.js', () => ({
        authenticateApiKey: (_req, _res, next) => next(),
        requireTenantAccess: (_req, _res, next) => next()
      }));
      jest.unstable_mockModule('../../middleware/validation.js', () => ({
        validateRequest: () => (_req, _res, next) => next(),
        validationSchemas: { queryParams: {}, createClient: {} }
      }));
      jest.unstable_mockModule('../../lib/retry-logic.js', () => ({
        getRetryManager: () => ({ execute: (fn) => fn() }),
        getCircuitBreaker: () => ({ execute: (fn) => fn() })
      }));
      jest.unstable_mockModule('../../db.js', () => ({
        safeQuery: jest.fn(async () => ({ rows: [] })),
        getFullClient: jest.fn(async (key) => (key === 'acme' ? { clientKey: 'acme' } : null)),
        upsertFullClient: jest.fn(async () => {})
      }));
      const { default: router } = await import('../../routes/clients.js');
      const app = createContractApp({ mounts: [{ path: '/api/clients', router }] });
      const res = await request(app).get('/api/clients/acme').expect(200);
      expect(res.body).toEqual(expect.objectContaining({ success: true, data: { clientKey: 'acme' } }));
    });

    test('failure: GET /:clientKey with short key returns validation error', async () => {
      jest.unstable_mockModule('../../middleware/security.js', () => ({
        authenticateApiKey: (_req, _res, next) => next(),
        requireTenantAccess: (_req, _res, next) => next()
      }));
      jest.unstable_mockModule('../../middleware/validation.js', () => ({
        validateRequest: () => (_req, _res, next) => next(),
        validationSchemas: { queryParams: {}, createClient: {} }
      }));
      jest.unstable_mockModule('../../lib/retry-logic.js', () => ({
        getRetryManager: () => ({ execute: (fn) => fn() }),
        getCircuitBreaker: () => ({ execute: (fn) => fn() })
      }));
      jest.unstable_mockModule('../../db.js', () => ({
        safeQuery: jest.fn(async () => ({ rows: [] })),
        getFullClient: jest.fn(async () => null),
        upsertFullClient: jest.fn(async () => {})
      }));
      const { default: router } = await import('../../routes/clients.js');
      const app = createContractApp({ mounts: [{ path: '/api/clients', router }] });
      const res = await request(app).get('/api/clients/x');
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('routes/demo-setup.js', () => {
    test('happy: GET /check-db returns tenants list', async () => {
      jest.unstable_mockModule('../../db.js', () => ({
        query: jest.fn(async () => ({ rows: [{ client_key: 'demo', display_name: 'D', vapi_json: {} }] }))
      }));
      const { default: router } = await import('../../routes/demo-setup.js');
      const app = createContractApp({ mounts: [{ path: '/', router }] });
      const res = await request(app).get('/check-db').expect(200);
      expect(res.body).toEqual(expect.objectContaining({ success: true, tenants: expect.any(Array) }));
    });

    test('failure: GET /check-db returns 500 when query throws', async () => {
      jest.unstable_mockModule('../../db.js', () => ({
        query: jest.fn(async () => {
          throw new Error('db_down');
        })
      }));
      const { default: router } = await import('../../routes/demo-setup.js');
      const app = createContractApp({ mounts: [{ path: '/', router }] });
      await request(app).get('/check-db').expect(500);
    });
  });

  describe('routes/receptionist.js', () => {
    test('happy: GET business-info returns payload', async () => {
      jest.unstable_mockModule('../../middleware/security.js', () => ({
        authenticateApiKey: (_req, _res, next) => next(),
        requireTenantAccess: (_req, _res, next) => next()
      }));
      jest.unstable_mockModule('../../lib/business-info.js', () => ({
        getBusinessInfo: jest.fn(async () => ({ name: 'Clinic' })),
        updateBusinessInfo: jest.fn(async () => ({})),
        getBusinessHoursString: jest.fn(),
        getServicesList: jest.fn(),
        answerQuestion: jest.fn(),
        upsertFAQ: jest.fn()
      }));
      jest.unstable_mockModule('../../lib/customer-profiles.js', () => ({
        getCustomerProfile: jest.fn(),
        upsertCustomerProfile: jest.fn(),
        updateCustomerPreferences: jest.fn(),
        setVipStatus: jest.fn(),
        getCustomerGreeting: jest.fn()
      }));
      jest.unstable_mockModule('../../db.js', () => ({ query: jest.fn(async () => ({ rows: [] })) }));
      const { default: router } = await import('../../routes/receptionist.js');
      const app = createContractApp({ mounts: [{ path: '/', router }] });
      const res = await request(app).get('/api/receptionist/c1/business-info').expect(200);
      expect(res.body).toEqual(expect.objectContaining({ success: true, info: { name: 'Clinic' } }));
    });

    test('failure: GET answer-question without question returns 400', async () => {
      jest.unstable_mockModule('../../middleware/security.js', () => ({
        authenticateApiKey: (_req, _res, next) => next(),
        requireTenantAccess: (_req, _res, next) => next()
      }));
      jest.unstable_mockModule('../../lib/business-info.js', () => ({
        getBusinessInfo: jest.fn(async () => ({})),
        updateBusinessInfo: jest.fn(async () => ({})),
        getBusinessHoursString: jest.fn(),
        getServicesList: jest.fn(),
        answerQuestion: jest.fn(),
        upsertFAQ: jest.fn()
      }));
      jest.unstable_mockModule('../../lib/customer-profiles.js', () => ({
        getCustomerProfile: jest.fn(),
        upsertCustomerProfile: jest.fn(),
        updateCustomerPreferences: jest.fn(),
        setVipStatus: jest.fn(),
        getCustomerGreeting: jest.fn()
      }));
      jest.unstable_mockModule('../../db.js', () => ({ query: jest.fn(async () => ({ rows: [] })) }));
      const { default: router } = await import('../../routes/receptionist.js');
      const app = createContractApp({ mounts: [{ path: '/', router }] });
      await request(app).get('/api/receptionist/c1/answer-question').expect(400);
    });
  });

  describe('routes/static-pages.js', () => {
    test('happy: GET /tenant-dashboard returns HTML', async () => {
      const { default: router } = await import('../../routes/static-pages.js');
      const app = createContractApp({ mounts: [{ path: '/', router }], json: false });
      // Avoid filesystem-bound `res.sendFile()` in coverage runs (can be slow/flaky on some envs).
      app.response.sendFile = function () {
        return this.status(200).send('<html>ok</html>');
      };
      const res = await request(app).get('/tenant-dashboard').expect(200);
      expect(res.text).toMatch(/html/i);
    });

    test('failure: GET unknown named route may 404 via express', async () => {
      const { default: router } = await import('../../routes/static-pages.js');
      const app = createContractApp({ mounts: [{ path: '/', router }], json: false });
      await request(app).get('/this-route-does-not-exist-on-static-pages-router').expect(404);
    });
  });

  describe('routes/api/v1/index.js', () => {
    test('happy: GET / returns v1 metadata', async () => {
      const { default: router } = await import('../../routes/api/v1/index.js');
      const app = createContractApp({ mounts: [{ path: '/', router }] });
      const res = await request(app).get('/').expect(200);
      expect(res.body).toEqual(expect.objectContaining({ version: '1.0.0', status: 'active' }));
    });

    test('failure: unknown subpath returns 404', async () => {
      const { default: router } = await import('../../routes/api/v1/index.js');
      const app = createContractApp({ mounts: [{ path: '/', router }] });
      await request(app).get('/no-such-v1-route').expect(404);
    });
  });

  describe('routes/twilio-voice-webhooks.js', () => {
    test('happy: inbound voice returns TwiML when routing succeeds', async () => {
      await withEnv({ TWILIO_AUTH_TOKEN: undefined, VAPI_FORWARD_NUMBER: undefined }, async () => {
        jest.unstable_mockModule('../../lib/inbound-call-router.js', () => ({
          routeInboundCall: jest.fn(async () => ({
            success: true,
            vapiConfig: {},
            client: { key: 'c1', name: 'Acme' },
            callContext: {}
          })),
          createVapiInboundCall: jest.fn(async () => ({ callId: 'vapi_1' })),
          logInboundCall: jest.fn(async () => {})
        }));
        jest.unstable_mockModule('../../lib/demo-telemetry.js', () => ({
          recordReceptionistTelemetry: jest.fn(async () => {}),
          recordDemoTelemetry: jest.fn(async () => {}),
          readDemoTelemetry: jest.fn(async () => []),
          clearDemoTelemetry: jest.fn(async () => {})
        }));
        const { default: router } = await import('../../routes/twilio-voice-webhooks.js');
        const app = createContractApp({ mounts: [{ path: '/', router }], json: false });
        const res = await request(app)
          .post('/webhooks/twilio-voice-inbound')
          .type('form')
          .send({ CallSid: 'CA1', From: '+441234567890', To: '+449876543210', CallStatus: 'ringing' })
          .expect(200);
        expect(res.text).toMatch(/Response/);
      });
    });

    test('failure: inbound voice returns fallback TwiML when routing fails', async () => {
      await withEnv({ TWILIO_AUTH_TOKEN: undefined }, async () => {
        jest.unstable_mockModule('../../lib/inbound-call-router.js', () => ({
          routeInboundCall: jest.fn(async () => ({ success: false })),
          createVapiInboundCall: jest.fn(),
          logInboundCall: jest.fn()
        }));
        jest.unstable_mockModule('../../lib/demo-telemetry.js', () => ({
          recordReceptionistTelemetry: jest.fn(async () => {}),
          recordDemoTelemetry: jest.fn(async () => {}),
          readDemoTelemetry: jest.fn(async () => []),
          clearDemoTelemetry: jest.fn(async () => {})
        }));
        const { default: router } = await import('../../routes/twilio-voice-webhooks.js');
        const app = createContractApp({ mounts: [{ path: '/', router }], json: false });
        const res = await request(app)
          .post('/webhooks/twilio-voice-inbound')
          .type('form')
          .send({ CallSid: 'CA1', From: '+441234567890', To: '+449876543210', CallStatus: 'ringing' })
          .expect(200);
        expect(res.text).toMatch(/unable to process your call/i);
      });
    });
  });
});
