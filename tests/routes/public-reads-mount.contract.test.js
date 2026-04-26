import { describe, test, expect, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createPublicReadsRouter } from '../../routes/public-reads-mount.js';

function sseDeps(overrides = {}) {
  return {
    query: jest.fn(async () => ({ rows: [] })),
    getFullClient: jest.fn(async () => ({ sms: {} })),
    activityFeedChannelLabel: () => 'AI call',
    outcomeToFriendlyLabel: () => 'Done',
    isCallQueueStartFailureRow: () => false,
    parseCallsRowMetadata: () => ({}),
    formatCallDuration: () => '',
    truncateActivityFeedText: (t) => String(t || '').slice(0, 10),
    mapCallStatus: (s) => s || 'unknown',
    mapStatusClass: () => 'info',
    ssePollIntervalMs: 60000,
    sseHeartbeatMs: 60000,
    ...overrides
  };
}

describe('routes/public-reads-mount', () => {
  const prevEnable = process.env.ENABLE_PUBLIC_DEV_ROUTES;
  const prevNode = process.env.NODE_ENV;
  const prevApiKey = process.env.API_KEY;

  afterEach(() => {
    if (prevEnable !== undefined) process.env.ENABLE_PUBLIC_DEV_ROUTES = prevEnable;
    else delete process.env.ENABLE_PUBLIC_DEV_ROUTES;
    if (prevNode !== undefined) process.env.NODE_ENV = prevNode;
    else delete process.env.NODE_ENV;
    if (prevApiKey !== undefined) process.env.API_KEY = prevApiKey;
    else delete process.env.API_KEY;
  });

  test('GET /mock-call returns 404 when ENABLE_PUBLIC_DEV_ROUTES is off', async () => {
    delete process.env.ENABLE_PUBLIC_DEV_ROUTES;
    const app = express();
    app.use(
      createPublicReadsRouter({
        nanoid: (n) => 'x'.repeat(n || 8),
        getFullClient: jest.fn(),
        isPostgres: false,
        query: jest.fn(),
        eventsSseDeps: sseDeps()
      })
    );
    const res = await request(app).get('/mock-call');
    expect(res.status).toBe(404);
  });

  test('GET /mock-call returns success false when no Vapi keys (gate on)', async () => {
    process.env.ENABLE_PUBLIC_DEV_ROUTES = '1';
    const prevPriv = process.env.VAPI_PRIVATE_KEY;
    const prevPub = process.env.VAPI_PUBLIC_KEY;
    const prevApi = process.env.VAPI_API_KEY;
    delete process.env.VAPI_PRIVATE_KEY;
    delete process.env.VAPI_PUBLIC_KEY;
    delete process.env.VAPI_API_KEY;
    try {
      const app = express();
      app.use(
        createPublicReadsRouter({
          nanoid: (n) => 'x'.repeat(n || 8),
          getFullClient: jest.fn(),
          isPostgres: false,
          query: jest.fn(),
          eventsSseDeps: sseDeps()
        })
      );
      const res = await request(app).get('/mock-call').query({
        assistantId: 'asst-1',
        phoneNumberId: 'ph-1',
        phone: '+15551234567'
      });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/VAPI|key/i);
    } finally {
      if (prevPriv !== undefined) process.env.VAPI_PRIVATE_KEY = prevPriv;
      else delete process.env.VAPI_PRIVATE_KEY;
      if (prevPub !== undefined) process.env.VAPI_PUBLIC_KEY = prevPub;
      else delete process.env.VAPI_PUBLIC_KEY;
      if (prevApi !== undefined) process.env.VAPI_API_KEY = prevApi;
      else delete process.env.VAPI_API_KEY;
    }
  });

  test('GET /mock-call returns 400 when required query params missing', async () => {
    process.env.ENABLE_PUBLIC_DEV_ROUTES = 'true';
    process.env.VAPI_API_KEY = 'test-key';
    const app = express();
    app.use(
      createPublicReadsRouter({
        nanoid: (n) => 'x'.repeat(n || 8),
        getFullClient: jest.fn(),
        isPostgres: false,
        query: jest.fn(),
        eventsSseDeps: sseDeps()
      })
    );
    const res = await request(app).get('/mock-call');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('production + API_KEY requires X-API-Key for gated routes', async () => {
    process.env.ENABLE_PUBLIC_DEV_ROUTES = '1';
    process.env.NODE_ENV = 'production';
    process.env.API_KEY = 'secret-gate-key';
    const app = express();
    app.use(
      createPublicReadsRouter({
        nanoid: () => 'id',
        getFullClient: jest.fn(async () => ({ booking: { timezone: 'UTC' } })),
        isPostgres: false,
        query: jest.fn(),
        eventsSseDeps: sseDeps()
      })
    );
    const res = await request(app).get('/api/outbound-queue-day/c1').query({ day: '2026-01-15' });
    expect(res.status).toBe(401);
    const ok = await request(app)
      .get('/api/outbound-queue-day/c1')
      .set('X-API-Key', 'secret-gate-key')
      .query({ day: '2026-01-15' });
    expect(ok.status).toBe(200);
  });

  test('failure: GET /api/outbound-queue-day/:clientKey returns 400 for bad day', async () => {
    process.env.ENABLE_PUBLIC_DEV_ROUTES = 'yes';
    const app = express();
    app.use(
      createPublicReadsRouter({
        nanoid: () => 'id',
        getFullClient: jest.fn(),
        isPostgres: false,
        query: jest.fn(),
        eventsSseDeps: sseDeps()
      })
    );
    const res = await request(app).get('/api/outbound-queue-day/c1').query({ day: 'not-a-day' });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  test('happy: GET /api/outbound-queue-day/:clientKey sqlite returns empty hours', async () => {
    process.env.ENABLE_PUBLIC_DEV_ROUTES = '1';
    const app = express();
    app.use(
      createPublicReadsRouter({
        nanoid: () => 'id',
        getFullClient: jest.fn(async () => ({ booking: { timezone: 'UTC' } })),
        isPostgres: false,
        query: jest.fn(),
        eventsSseDeps: sseDeps()
      })
    );
    const res = await request(app).get('/api/outbound-queue-day/c1').query({ day: '2026-01-15' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.hours).toEqual([]);
  });
});
