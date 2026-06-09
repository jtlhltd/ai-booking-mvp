import request from 'supertest';
import express from 'express';
import { jest } from '@jest/globals';
import { createSentryCursorRelayRouter } from '../../routes/sentry-cursor-relay-mount.js';

describe('routes/sentry-cursor-relay-mount', () => {
  const originalFetch = global.fetch;
  const originalSecret = process.env.SENTRY_SELF_HEAL_RELAY_SECRET;
  const originalUrl = process.env.CURSOR_SELF_HEAL_WEBHOOK_URL;
  const originalAuth = process.env.CURSOR_SELF_HEAL_WEBHOOK_AUTH;

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalSecret === undefined) delete process.env.SENTRY_SELF_HEAL_RELAY_SECRET;
    else process.env.SENTRY_SELF_HEAL_RELAY_SECRET = originalSecret;
    if (originalUrl === undefined) delete process.env.CURSOR_SELF_HEAL_WEBHOOK_URL;
    else process.env.CURSOR_SELF_HEAL_WEBHOOK_URL = originalUrl;
    if (originalAuth === undefined) delete process.env.CURSOR_SELF_HEAL_WEBHOOK_AUTH;
    else process.env.CURSOR_SELF_HEAL_WEBHOOK_AUTH = originalAuth;
  });

  function buildApp() {
    const app = express();
    app.use(createSentryCursorRelayRouter());
    return app;
  }

  test('POST /webhooks/sentry-self-heal forwards to Cursor webhook', async () => {
    process.env.CURSOR_SELF_HEAL_WEBHOOK_URL = 'https://api2.cursor.sh/automations/webhook/test';
    process.env.CURSOR_SELF_HEAL_WEBHOOK_AUTH = 'crsr_testtoken';
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ success: true, backgroundComposerId: 'bc-test' })
    }));

    const res = await request(buildApp())
      .post('/webhooks/sentry-self-heal')
      .send({ issue: { id: 'AI-BOOKING-MVP-7' }, project: 'ai-booking-mvp' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.cursor.success).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api2.cursor.sh/automations/webhook/test',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer crsr_testtoken'
        })
      })
    );
  });

  test('POST /webhooks/sentry-self-heal rejects bad relay secret when configured', async () => {
    process.env.SENTRY_SELF_HEAL_RELAY_SECRET = 'relay-secret';

    const res = await request(buildApp())
      .post('/webhooks/sentry-self-heal')
      .send({ issue: { id: 'AI-BOOKING-MVP-7' } });

    expect(res.status).toBe(401);
  });
});
