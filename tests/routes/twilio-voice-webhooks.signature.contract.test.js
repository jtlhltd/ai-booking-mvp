// intent: webhook.signature-required
// This contract test enforces that the Twilio voice webhook rejects unsigned
// payloads when TWILIO_AUTH_TOKEN is configured. It is the enforcement gate
// for the `webhook.signature-required` row in docs/INTENT.md alongside the
// matching policy rule in scripts/check-policy.mjs.
import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import request from 'supertest';

import { createContractApp, withEnv } from '../helpers/contract-harness.js';

beforeEach(() => {
  jest.resetModules();
});

describe('Twilio Voice webhook signature contract', () => {
  test('403 when TWILIO_AUTH_TOKEN set and signature missing', async () => {
    await withEnv({ TWILIO_AUTH_TOKEN: 'token' }, async () => {
      const { default: router } = await import('../../routes/twilio-voice-webhooks.js');
      const app = createContractApp({ mounts: [{ path: '/', router }], json: false });
      await request(app)
        .post('/webhooks/twilio-voice-inbound')
        .type('form')
        .send({ CallSid: 'CA1', From: '+441', To: '+442', CallStatus: 'ringing' })
        .expect(403);
    });
  });

  test('403 when TWILIO_AUTH_TOKEN set and signature invalid', async () => {
    await withEnv({ TWILIO_AUTH_TOKEN: 'token' }, async () => {
      const { default: router } = await import('../../routes/twilio-voice-webhooks.js');
      const app = createContractApp({ mounts: [{ path: '/', router }], json: false });
      await request(app)
        .post('/webhooks/twilio-voice-inbound')
        .set('X-Twilio-Signature', 'not-valid')
        .type('form')
        .send({ CallSid: 'CA1', From: '+441', To: '+442', CallStatus: 'ringing' })
        .expect(403);
    });
  });
});

