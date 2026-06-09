import { describe, test, expect } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createHealthProbesRouter } from '../../routes/health-probes-mount.js';

describe('routes/health-probes-mount', () => {
  function buildApp() {
    const app = express();
    app.use(
      createHealthProbesRouter({
        healthzDeps: {
          listFullClients: async () => [{ clientKey: 'a' }],
          getIntegrationFlags: () => ({
            gcalConfigured: false,
            smsConfigured: false,
            corsOrigin: 'any',
            dbPath: 'test'
          })
        },
        gcalPingDeps: {
          getGoogleCredentials: () => ({
            clientEmail: null,
            privateKey: null,
            privateKeyB64: null
          })
        }
      })
    );
    return app;
  }

  test('GET /healthz returns ok', async () => {
    const res = await request(buildApp()).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('GET /gcal/ping returns 400 when Google credentials missing', async () => {
    const res = await request(buildApp()).get('/gcal/ping');
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toMatch(/Google env missing/i);
  });

  test('GET /debug-sentry returns 404 unless DEBUG_SENTRY=true', async () => {
    const prev = process.env.DEBUG_SENTRY;
    delete process.env.DEBUG_SENTRY;
    try {
      const res = await request(buildApp()).get('/debug-sentry');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('not_found');
    } finally {
      if (prev === undefined) delete process.env.DEBUG_SENTRY;
      else process.env.DEBUG_SENTRY = prev;
    }
  });

  test('GET /api/public/sentry-config returns 204 when Sentry is unset', async () => {
    const prev = process.env.SENTRY_DSN;
    delete process.env.SENTRY_DSN;
    try {
      const res = await request(buildApp()).get('/api/public/sentry-config');
      expect(res.status).toBe(204);
    } finally {
      if (prev === undefined) delete process.env.SENTRY_DSN;
      else process.env.SENTRY_DSN = prev;
    }
  });

  test('GET /heal-test returns 404 unless HEAL_TEST_ENABLED=true', async () => {
    const prev = process.env.HEAL_TEST_ENABLED;
    delete process.env.HEAL_TEST_ENABLED;
    try {
      const res = await request(buildApp()).get('/heal-test');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('not_found');
    } finally {
      if (prev === undefined) delete process.env.HEAL_TEST_ENABLED;
      else process.env.HEAL_TEST_ENABLED = prev;
    }
  });

  test('GET /heal-test succeeds when enabled and Sentry is configured', async () => {
    const prevHealTest = process.env.HEAL_TEST_ENABLED;
    const prevSentryDsn = process.env.SENTRY_DSN;
    process.env.HEAL_TEST_ENABLED = 'true';
    process.env.SENTRY_DSN = 'https://public@example.com/1';
    try {
      const res = await request(buildApp()).get('/heal-test');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    } finally {
      if (prevHealTest === undefined) delete process.env.HEAL_TEST_ENABLED;
      else process.env.HEAL_TEST_ENABLED = prevHealTest;
      if (prevSentryDsn === undefined) delete process.env.SENTRY_DSN;
      else process.env.SENTRY_DSN = prevSentryDsn;
    }
  });

  test('GET /debug-sentry-trace returns 404 unless DEBUG_SENTRY=true', async () => {
    const prev = process.env.DEBUG_SENTRY;
    delete process.env.DEBUG_SENTRY;
    try {
      const res = await request(buildApp()).get('/debug-sentry-trace');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('not_found');
    } finally {
      if (prev === undefined) delete process.env.DEBUG_SENTRY;
      else process.env.DEBUG_SENTRY = prev;
    }
  });
});
