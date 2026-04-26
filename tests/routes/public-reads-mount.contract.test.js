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
  test('GET /mock-call returns success false when no Vapi keys', async () => {
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
      const res = await request(app).get('/mock-call');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/VAPI|key/i);
    } finally {
      if (prevPriv !== undefined) process.env.VAPI_PRIVATE_KEY = prevPriv;
      if (prevPub !== undefined) process.env.VAPI_PUBLIC_KEY = prevPub;
      if (prevApi !== undefined) process.env.VAPI_API_KEY = prevApi;
    }
  });

  test('failure: GET /api/outbound-queue-day/:clientKey returns 400 for bad day', async () => {
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
