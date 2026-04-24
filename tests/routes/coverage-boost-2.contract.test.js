import { describe, expect, test, jest, beforeEach, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';

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

describe('Coverage boost 2: deepen low-coverage routers', () => {
  describe('routes/google-places-search.js', () => {
    test('failure: 400 when query/location missing', async () => {
      const { default: router } = await import('../../routes/google-places-search.js');
      const app = createContractApp({ mounts: [{ path: '/', router }] });
      await request(app).post('/api/search-google-places').send({}).expect(400);
    });

    test('happy: returns results when Google responses are mocked', async () => {
      globalThis.fetch = jest.fn(async (url) => {
        const u = String(url);
        if (u.includes('/place/textsearch/json')) {
          return { json: async () => ({ results: [{ place_id: 'p1', name: 'A' }] }) };
        }
        if (u.includes('/place/details/json')) {
          return {
            json: async () => ({
              result: {
                name: 'A',
                formatted_phone_number: '+447700900000',
                website: 'https://example.com',
                formatted_address: '1 Road',
                rating: 4.5
              }
            })
          };
        }
        return { json: async () => ({ results: [] }) };
      });

      const { default: router } = await import('../../routes/google-places-search.js');
      const app = createContractApp({ mounts: [{ path: '/', router }] });

      await withEnv({ GOOGLE_PLACES_API_KEY: 'k' }, async () => {
        const res = await request(app)
          .post('/api/search-google-places')
          .send({ query: 'Dentist', location: 'Leeds', maxResults: 1 })
          .expect(200);
        expect(res.body).toEqual(expect.objectContaining({ success: true, results: expect.any(Array) }));
      });
    });
  });

  describe('routes/demo-setup.js', () => {
    test('happy: GET /demo-setup/check-db returns tenants list', async () => {
      const query = jest.fn(async () => ({ rows: [{ client_key: 'c1' }] }));
      jest.unstable_mockModule('../../db.js', () => ({ query }));
      const { default: router } = await import('../../routes/demo-setup.js');
      const app = createContractApp({ mounts: [{ path: '/demo-setup', router }] });
      const res = await request(app).get('/demo-setup/check-db').expect(200);
      expect(res.body).toEqual(expect.objectContaining({ success: true, tenants: expect.any(Array) }));
    });

    test('failure: GET /demo-setup/check-db returns 500 when db throws', async () => {
      const query = jest.fn(async () => {
        throw new Error('db down');
      });
      jest.unstable_mockModule('../../db.js', () => ({ query }));
      const { default: router } = await import('../../routes/demo-setup.js');
      const app = createContractApp({ mounts: [{ path: '/demo-setup', router }] });
      await request(app).get('/demo-setup/check-db').expect(500);
    });
  });

  describe('routes/receptionist.js', () => {
    test('happy: GET business-info returns success true', async () => {
      jest.unstable_mockModule('../../middleware/security.js', () => ({
        authenticateApiKey: (_req, _res, next) => next(),
        requireTenantAccess: (_req, _res, next) => next()
      }));
      jest.unstable_mockModule('../../lib/business-info.js', () => ({
        getBusinessInfo: jest.fn(async () => ({ name: 'Acme' })),
        updateBusinessInfo: jest.fn(async () => ({ ok: true })),
        getBusinessHoursString: jest.fn(),
        getServicesList: jest.fn(),
        answerQuestion: jest.fn(),
        upsertFAQ: jest.fn()
      }));
      jest.unstable_mockModule('../../db.js', () => ({ query: jest.fn(async () => ({ rows: [] })) }));

      const { default: router } = await import('../../routes/receptionist.js');
      const app = createContractApp({ mounts: [{ path: '/', router }] });
      const res = await request(app).get('/api/receptionist/c1/business-info').expect(200);
      expect(res.body).toEqual(expect.objectContaining({ success: true, info: expect.any(Object) }));
    });

    test('failure: GET answer-question requires question', async () => {
      jest.unstable_mockModule('../../middleware/security.js', () => ({
        authenticateApiKey: (_req, _res, next) => next(),
        requireTenantAccess: (_req, _res, next) => next()
      }));
      jest.unstable_mockModule('../../lib/business-info.js', () => ({
        getBusinessInfo: jest.fn(),
        updateBusinessInfo: jest.fn(),
        getBusinessHoursString: jest.fn(),
        getServicesList: jest.fn(),
        answerQuestion: jest.fn(),
        upsertFAQ: jest.fn()
      }));
      jest.unstable_mockModule('../../db.js', () => ({ query: jest.fn(async () => ({ rows: [] })) }));

      const { default: router } = await import('../../routes/receptionist.js');
      const app = createContractApp({ mounts: [{ path: '/', router }] });
      await request(app).get('/api/receptionist/c1/answer-question').expect(400);
    });
  });

  describe('routes/twilio-voice-webhooks.js', () => {
    test('happy: inbound returns TwiML fallback when routing throws', async () => {
      jest.unstable_mockModule('../../lib/inbound-call-router.js', () => ({
        routeInboundCall: jest.fn(async () => {
          throw new Error('route down');
        }),
        createVapiInboundCall: jest.fn(),
        logInboundCall: jest.fn()
      }));
      const { default: router } = await import('../../routes/twilio-voice-webhooks.js');
      const app = createContractApp({ mounts: [{ path: '/', router }] });
      const res = await request(app)
        .post('/webhooks/twilio-voice-inbound')
        .type('form')
        .send({ CallSid: 'CS1', From: '+447700900000', To: '+447700900001', CallStatus: 'ringing' })
        .expect(200);
      expect(String(res.text)).toContain('<Response>');
      expect(String(res.text)).toContain('<Say');
    });

    test('happy: inbound returns TwiML Dial when forward number configured', async () => {
      jest.unstable_mockModule('../../lib/inbound-call-router.js', () => ({
        routeInboundCall: jest.fn(async () => ({ success: true, client: { key: 'c1', name: 'Acme' }, vapiConfig: {}, callContext: {} })),
        createVapiInboundCall: jest.fn(async () => ({ callId: 'v1' })),
        logInboundCall: jest.fn(async () => {})
      }));
      jest.unstable_mockModule('../../lib/demo-telemetry.js', () => ({
        recordReceptionistTelemetry: jest.fn(async () => {})
      }));

      const { default: router } = await import('../../routes/twilio-voice-webhooks.js');
      const app = createContractApp({ mounts: [{ path: '/', router }] });

      await withEnv({ VAPI_FORWARD_NUMBER: '+15551234567' }, async () => {
        const res = await request(app)
          .post('/webhooks/twilio-voice-inbound')
          .type('form')
          .send({ CallSid: 'CS1', From: '+447700900000', To: '+447700900001', CallStatus: 'ringing' })
          .expect(200);
        expect(String(res.text)).toContain('<Dial>');
        expect(String(res.text)).toContain('+15551234567');
      });
    });
  });
});

