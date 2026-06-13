import request from 'supertest';
import express from 'express';
import { jest } from '@jest/globals';
import { createCursorAutomationRelayRouter } from '../../routes/cursor-automation-relay-mount.js';
import { createSentryCursorRelayRouter } from '../../routes/sentry-cursor-relay-mount.js';
import { resetAutomationTriggerDedupeForTests } from '../../lib/automation-trigger-dedupe.js';

describe('routes/cursor-automation-relay-mount', () => {
  const originalFetch = global.fetch;
  const originalSecret = process.env.SENTRY_SELF_HEAL_RELAY_SECRET;
  const originalUrl = process.env.CURSOR_SELF_HEAL_WEBHOOK_URL;
  const originalAuth = process.env.CURSOR_SELF_HEAL_WEBHOOK_AUTH;
  const originalResolveToken = process.env.SENTRY_RESOLVE_AUTH_TOKEN;

  beforeEach(() => {
    resetAutomationTriggerDedupeForTests();
    delete process.env.SENTRY_SELF_HEAL_TRIGGER_COOLDOWN_MS;
    delete process.env.SENTRY_SELF_HEAL_RELAY_SECRET;
    delete process.env.CURSOR_AUTOMATION_RELAY_SECRET;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    resetAutomationTriggerDedupeForTests();
    if (originalSecret === undefined) delete process.env.SENTRY_SELF_HEAL_RELAY_SECRET;
    else process.env.SENTRY_SELF_HEAL_RELAY_SECRET = originalSecret;
    if (originalUrl === undefined) delete process.env.CURSOR_SELF_HEAL_WEBHOOK_URL;
    else process.env.CURSOR_SELF_HEAL_WEBHOOK_URL = originalUrl;
    if (originalAuth === undefined) delete process.env.CURSOR_SELF_HEAL_WEBHOOK_AUTH;
    else process.env.CURSOR_SELF_HEAL_WEBHOOK_AUTH = originalAuth;
    if (originalResolveToken === undefined) delete process.env.SENTRY_RESOLVE_AUTH_TOKEN;
    else process.env.SENTRY_RESOLVE_AUTH_TOKEN = originalResolveToken;
  });

  function buildApp() {
    const app = express();
    app.use(createCursorAutomationRelayRouter());
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

  test('POST /webhooks/sentry-self-heal/resolve resolves issue via Sentry API', async () => {
    process.env.SENTRY_RESOLVE_AUTH_TOKEN = 'sntryu_resolve';
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ status: 'resolved' })
    }));

    const res = await request(buildApp())
      .post('/webhooks/sentry-self-heal/resolve')
      .send({ issue: { id: 'AI-BOOKING-MVP-7' }, reason: 'prod verified' });

    expect(res.status).toBe(200);
    expect(res.body.resolved).toBe(true);
    expect(res.body.issueId).toBe('AI-BOOKING-MVP-7');
  });

  test('POST /webhooks/automation/github forwards ci-failed payload', async () => {
    process.env.CURSOR_CI_FAIL_WEBHOOK_URL = 'https://api2.cursor.sh/automations/webhook/ci';
    process.env.CURSOR_CI_FAIL_WEBHOOK_AUTH = 'crsr_ci';
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ success: true })
    }));

    const res = await request(buildApp())
      .post('/webhooks/automation/github')
      .send({
        type: 'ci-failed',
        runId: '999',
        runUrl: 'https://github.com/jtlhltd/ai-booking-mvp/actions/runs/999',
        repository: 'jtlhltd/ai-booking-mvp',
        branch: 'main'
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.automation).toBe('ci-failed');
  });

  test('sentry-cursor-relay mount exports the relay router alias', () => {
    expect(createSentryCursorRelayRouter).toBe(createCursorAutomationRelayRouter);
  });
});
