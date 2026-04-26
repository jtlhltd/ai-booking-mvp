import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';

import { createContractApp, withEnv } from '../helpers/contract-harness.js';

beforeEach(() => {
  jest.resetModules();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('routes/twilio-voice-webhooks.js recording + callback contracts', () => {
  test('recording webhook processes voicemail + notifies client (twilio client mocked, fake timers)', async () => {
    jest.useFakeTimers();

    const sendEmail = jest.fn(async () => {});
    const sendSMS = jest.fn(async () => {});

    await withEnv(
      {
        // Twilio client exists only if both are set at import time
        TWILIO_ACCOUNT_SID: 'AC_test',
        TWILIO_AUTH_TOKEN: 'auth_test',
        APP_URL: 'https://example.test',
      },
      async () => {
        jest.unstable_mockModule('twilio', () => {
          const validateRequest = jest.fn(() => true);
          const twilioFn = () => ({
            recordings: (_sid) => ({
              fetch: async () => ({ sid: 'RE1' }),
              transcriptions: {
                list: async () => [{ sid: 'TR1' }],
              },
            }),
            transcriptions: (_sid) => ({
              fetch: async () => ({ transcriptionText: "Hi this is John urgent please call me back ASAP" }),
            }),
          });
          twilioFn.validateRequest = validateRequest;
          return { default: twilioFn };
        });

        jest.unstable_mockModule('../../lib/inbound-call-router.js', () => ({
          routeInboundCall: jest.fn(async () => ({ success: true, client: { key: 'c1' } })),
          createVapiInboundCall: jest.fn(),
          logInboundCall: jest.fn(),
        }));

        jest.unstable_mockModule('../../lib/demo-telemetry.js', () => ({
          recordReceptionistTelemetry: jest.fn(async () => {}),
        }));

        jest.unstable_mockModule('../../lib/messaging-service.js', () => ({
          default: { sendEmail, sendSMS },
        }));

        jest.unstable_mockModule('../../db.js', () => ({
          getFullClient: jest.fn(async () => ({
            display_name: 'Acme',
            owner_email: 'owner@acme.test',
            owner_phone: '+447700900999',
          })),
          query: jest.fn(async (sql) => {
            const s = String(sql);
            if (s.includes('INSERT INTO messages') && s.includes('RETURNING id')) {
              return { rows: [{ id: 55 }] };
            }
            return { rows: [] };
          }),
        }));

        const { default: router } = await import('../../routes/twilio-voice-webhooks.js');
        const app = createContractApp({ mounts: [{ path: '/', router }], json: false });

        const res = await request(app)
          .post('/webhooks/twilio-voice-recording')
          .set('X-Twilio-Signature', 'sig')
          .type('form')
          .send({
            CallSid: 'CA1',
            RecordingSid: 'RE1',
            RecordingUrl: 'https://recording.test',
            RecordingDuration: '12',
            From: '+447700900000',
            To: '+447700900111',
          })
          .expect(200);

        expect(res.text).toBe('OK');

        // Voicemail processing includes a 2s delay before fetching transcription.
        await jest.advanceTimersByTimeAsync(2100);
        // Flush any follow-on microtasks.
        await Promise.resolve();
        await Promise.resolve();

        expect(sendEmail).toHaveBeenCalled();
        expect(sendSMS).toHaveBeenCalled();
      },
    );
  });

  test('callback webhook with Digits=1 returns thank-you TwiML and schedules async callback retry', async () => {
    const addToRetryQueue = jest.fn(async () => {});

    await withEnv({ TWILIO_AUTH_TOKEN: undefined }, async () => {
      jest.unstable_mockModule('../../lib/inbound-call-router.js', () => ({
        routeInboundCall: jest.fn(async () => ({ success: true, client: { key: 'c1' } })),
        createVapiInboundCall: jest.fn(),
        logInboundCall: jest.fn(),
      }));

      jest.unstable_mockModule('../../db.js', () => ({
        getFullClient: jest.fn(async () => ({ timezone: 'Europe/London' })),
        addToRetryQueue,
        query: jest.fn(async (sql) => {
          const s = String(sql);
          if (s.includes('INSERT INTO messages') && s.includes('RETURNING id')) {
            return { rows: [{ id: 77 }] };
          }
          return { rows: [] };
        }),
      }));

      jest.unstable_mockModule('../../lib/demo-telemetry.js', () => ({
        recordReceptionistTelemetry: jest.fn(async () => {}),
      }));

      const { default: router } = await import('../../routes/twilio-voice-webhooks.js');
      const app = createContractApp({ mounts: [{ path: '/', router }], json: false });

      const res = await request(app)
        .post('/webhooks/twilio-voice-callback')
        .type('form')
        .send({ CallSid: 'CA2', Digits: '1', From: '+447700900000', To: '+447700900111' })
        .expect(200);

      expect(res.text).toMatch(/We've received your callback request/i);

      // processCallbackRequest is async; allow it to run.
      await Promise.resolve();
      await Promise.resolve();

      expect(addToRetryQueue).toHaveBeenCalled();
    });
  });
});

