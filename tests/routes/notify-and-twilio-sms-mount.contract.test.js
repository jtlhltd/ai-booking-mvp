import { describe, test, expect, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createNotifyAndTwilioSmsRouter } from '../../routes/notify-and-twilio-sms-mount.js';
import { handleNotifyTest, handleNotifySend } from '../../lib/notify-api.js';
import { handleSmsStatusWebhook } from '../../lib/sms-status-webhook.js';
import { handleTwilioSmsInbound } from '../../lib/twilio-sms-inbound-webhook.js';

const passTwilio = (req, res, next) => next();

function buildApp(overrides = {}) {
  const app = express();
  app.use(
    createNotifyAndTwilioSmsRouter({
      notifySendDeps: {
        getClientFromHeader: async () => null,
        query: jest.fn(),
        smsConfig: {},
        normalizePhoneE164: (x) => x
      },
      smsStatusWebhookDeps: { query: jest.fn(), readJson: jest.fn(), writeJson: jest.fn(), smsStatusPath: '/tmp/x' },
      twilioSmsInboundDeps: {},
      handleNotifyTest,
      handleNotifySend,
      handleSmsStatusWebhook,
      handleTwilioSmsInbound,
      twilioWebhookVerification: passTwilio,
      smsRateLimit: passTwilio,
      safeAsync: (fn) => fn,
      ...overrides
    })
  );
  return app;
}

describe('routes/notify-and-twilio-sms-mount', () => {
  test('POST /api/notify/test returns ok', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/notify/test');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('POST /api/notify/send returns 400 when tenant unknown', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/notify/send').send({ channel: 'sms', message: 'hi' });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  test('POST /webhooks/twilio-status accepts urlencoded body', async () => {
    const handleSms = jest.fn((req, res) => res.status(200).send('OK'));
    const app = express();
    app.use(
      createNotifyAndTwilioSmsRouter({
        notifySendDeps: {},
        smsStatusWebhookDeps: {},
        twilioSmsInboundDeps: {},
        handleNotifyTest,
        handleNotifySend,
        handleSmsStatusWebhook: handleSms,
        handleTwilioSmsInbound,
        twilioWebhookVerification: passTwilio,
        smsRateLimit: passTwilio,
        safeAsync: (fn) => fn
      })
    );
    const res = await request(app).post('/webhooks/twilio-status').type('form').send('MessageStatus=delivered');
    expect(res.status).toBe(200);
    expect(handleSms).toHaveBeenCalled();
  });
});
