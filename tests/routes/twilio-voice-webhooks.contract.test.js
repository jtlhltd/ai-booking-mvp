import { describe, expect, test, jest } from '@jest/globals';
import request from 'supertest';

import { createContractApp, withEnv } from '../helpers/contract-harness.js';

const validateRequest = jest.fn(() => false);

jest.unstable_mockModule('twilio', () => {
  const twilioFn = () => null;
  twilioFn.validateRequest = validateRequest;
  return { default: twilioFn };
});

jest.unstable_mockModule('../../lib/inbound-call-router.js', () => ({
  routeInboundCall: jest.fn(async () => ({ success: false })),
  createVapiInboundCall: jest.fn(async () => ({ callId: 'call_1' })),
  logInboundCall: jest.fn(async () => {})
}));

jest.unstable_mockModule('../../lib/utils.js', () => ({
  normalizePhoneE164: jest.fn((p) => p)
}));

jest.unstable_mockModule('../../lib/demo-telemetry.js', () => ({
  recordReceptionistTelemetry: jest.fn(async () => {})
}));

describe('Twilio voice webhook contracts', () => {
  test('invalid signature yields 403 when TWILIO_AUTH_TOKEN is set', async () => {
    await withEnv({ TWILIO_AUTH_TOKEN: 'test_auth_token' }, async () => {
      const { default: router } = await import('../../routes/twilio-voice-webhooks.js');
      const app = createContractApp({ mounts: [{ path: '/', router }], json: false });

      await request(app)
        .post('/webhooks/twilio-voice-inbound')
        .set('X-Twilio-Signature', 'definitely-not-valid')
        .type('form')
        .send({
          CallSid: 'CA123',
          From: '+15551231234',
          To: '+15557654321',
          CallStatus: 'ringing'
        })
        .expect(403);

      expect(validateRequest).toHaveBeenCalled();
    });
  });

  test('missing signature header yields 403 when TWILIO_AUTH_TOKEN is set', async () => {
    await withEnv({ TWILIO_AUTH_TOKEN: 'test_auth_token' }, async () => {
      const { default: router } = await import('../../routes/twilio-voice-webhooks.js');
      const app = createContractApp({ mounts: [{ path: '/', router }], json: false });

      await request(app)
        .post('/webhooks/twilio-voice-inbound')
        .type('form')
        .send({
          CallSid: 'CA999',
          From: '+15551230000',
          To: '+15557650000',
          CallStatus: 'ringing'
        })
        .expect(403);
    });
  });
});

