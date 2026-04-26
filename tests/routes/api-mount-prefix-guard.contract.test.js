import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';

beforeEach(() => {
  jest.resetModules();
});

describe('API mount prefix guard', () => {
  test('call insights router mounted at /api serves /api/call-quality (not /api/api/...)', async () => {
    const { createCallInsightsRouter } = await import('../../routes/call-insights-mount.js');
    const app = express();
    app.use(
      '/api',
      createCallInsightsRouter({
        cacheMiddleware: () => (_req, _res, next) => next(),
        poolQuerySelect: async () => ({ rows: [] }),
        query: async () => ({ rows: [] }),
      }),
    );
    const bad = await request(app).get('/api/api/call-quality/c1');
    expect(bad.status).toBe(404);

    const ok = await request(app).get('/api/call-quality/c1');
    expect([200, 500]).toContain(ok.status);
  });
});
