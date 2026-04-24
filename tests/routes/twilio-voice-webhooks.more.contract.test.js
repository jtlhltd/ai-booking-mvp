import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import request from 'supertest';

import { createContractApp, withEnv } from '../helpers/contract-harness.js';

beforeEach(() => {
  jest.resetModules();
});

describe('routes/twilio-voice-webhooks.js more contracts', () => {
  test('routing failure returns fallback TwiML', async () => {
    await withEnv({ TWILIO_AUTH_TOKEN: undefined }, async () => {
      jest.unstable_mockModule('../../lib/inbound-call-router.js', () => ({
        routeInboundCall: jest.fn(async () => ({ success: false })),
        createVapiInboundCall: jest.fn(),
        logInboundCall: jest.fn()
      }));
      jest.unstable_mockModule('../../lib/demo-telemetry.js', () => ({
        recordReceptionistTelemetry: jest.fn(async () => {})
      }));

      const { default: router } = await import('../../routes/twilio-voice-webhooks.js');
      const app = createContractApp({ mounts: [{ path: '/', router }], json: false });
      const res = await request(app)
        .post('/webhooks/twilio-voice-inbound')
        .type('form')
        .send({ CallSid: 'CA1', From: '+441', To: '+442', CallStatus: 'ringing' })
        .expect(200);
      expect(res.text).toMatch(/unable to process your call/i);
    });
  });

  test('when VAPI_FORWARD_NUMBER set, returns Dial TwiML', async () => {
    await withEnv({ TWILIO_AUTH_TOKEN: undefined, VAPI_FORWARD_NUMBER: '+15551234567' }, async () => {
      jest.unstable_mockModule('../../lib/inbound-call-router.js', () => ({
        routeInboundCall: jest.fn(async () => ({
          success: true,
          vapiConfig: {},
          client: { key: 'c1', name: 'Acme' },
          callContext: {}
        })),
        createVapiInboundCall: jest.fn(async () => ({ callId: 'v1' })),
        logInboundCall: jest.fn(async () => {})
      }));
      jest.unstable_mockModule('../../lib/demo-telemetry.js', () => ({
        recordReceptionistTelemetry: jest.fn(async () => {})
      }));

      const { default: router } = await import('../../routes/twilio-voice-webhooks.js');
      const app = createContractApp({ mounts: [{ path: '/', router }], json: false });
      const res = await request(app)
        .post('/webhooks/twilio-voice-inbound')
        .type('form')
        .send({ CallSid: 'CA1', From: '+441', To: '+442', CallStatus: 'ringing' })
        .expect(200);
      expect(res.text).toMatch(/<Dial>/);
      expect(res.text).toMatch(/\+15551234567/);
    });
  });
});

