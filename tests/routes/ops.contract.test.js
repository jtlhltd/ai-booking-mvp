import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import request from 'supertest';

import { createContractApp } from '../helpers/contract-harness.js';

const trackerState = { statsNull: false, throwSlow: false };

beforeEach(() => {
  trackerState.statsNull = false;
  trackerState.throwSlow = false;
  jest.resetModules();
});

jest.unstable_mockModule('../../lib/query-performance-tracker.js', () => ({
  getSlowQueries: jest.fn(async () => {
    if (trackerState.throwSlow) throw new Error('slow_fail');
    return [{ q: 'select 1', duration_ms: 1200 }];
  }),
  getQueryPerformanceStats: jest.fn(async () => (trackerState.statsNull ? null : { total: 1 })),
  getOptimizationRecommendations: jest.fn(async () => [{ id: 'r1' }])
}));

jest.unstable_mockModule('../../lib/cache.js', () => ({
  cacheMiddleware: () => (_req, _res, next) => next(),
  getCache: () => ({ getStats: () => ({ ok: true }), clear: () => {} })
}));

jest.unstable_mockModule('../../lib/performance-monitor.js', () => ({
  getPerformanceMonitor: () => ({ getStats: () => ({ ok: true }), generateReport: () => ({ ok: true }) })
}));

jest.unstable_mockModule('../../lib/rate-limiting.js', () => ({
  getRateLimitStatus: jest.fn(async () => ({ limit: 1 })),
  getRateLimitStats: jest.fn(() => ({ ok: true }))
}));

jest.unstable_mockModule('../../db.js', () => ({
  query: jest.fn(async () => ({ rows: [{ count: 0 }] }))
}));

describe('Ops routes contracts', () => {
  test('GET /api/ops/intent-status returns ok+items and sets no-store cache', async () => {
    jest.unstable_mockModule('../../lib/ops-invariants.js', () => ({
      checkOpsInvariants: jest.fn(async () => ({ ok: true, checked: 1, results: [{ clientKey: 'c1', problems: [] }] })),
      summarizeOpsInvariants: jest.fn(() => ({
        ok: true,
        items: [{ intentId: 'billing.no-burst-dial', label: 'x', status: 'ok', detail: 'y' }]
      }))
    }));

    const { default: router } = await import('../../routes/ops.js');
    const app = createContractApp({ mounts: [{ path: '/', router }] });

    const res = await request(app).get('/api/ops/intent-status').expect(200);
    expect(String(res.headers['cache-control'] || '')).toMatch(/no-store/i);
    expect(res.body).toEqual(
      expect.objectContaining({
        ok: true,
        items: expect.any(Array),
        timestamp: expect.any(String)
      })
    );
  });

  test('GET /api/performance/queries/stats returns 500 when stats null', async () => {
    trackerState.statsNull = true;
    const { default: router } = await import('../../routes/ops.js');
    const app = createContractApp({ mounts: [{ path: '/', router }] });

    const res = await request(app).get('/api/performance/queries/stats').expect(500);
    expect(res.body).toEqual(expect.objectContaining({ ok: false }));
  });

  test('GET /api/performance/queries/stats returns ok+stats shape', async () => {
    const { default: router } = await import('../../routes/ops.js');
    const app = createContractApp({ mounts: [{ path: '/', router }] });

    const res = await request(app).get('/api/performance/queries/stats').expect(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        ok: true,
        stats: expect.any(Object),
        thresholds: expect.any(Object),
        timestamp: expect.any(String)
      })
    );
  });

  test('GET /api/performance/queries/slow returns 500 on tracker failure', async () => {
    trackerState.throwSlow = true;
    const { default: router } = await import('../../routes/ops.js');
    const app = createContractApp({ mounts: [{ path: '/', router }] });
    const res = await request(app).get('/api/performance/queries/slow').expect(500);
    expect(res.body).toEqual(expect.objectContaining({ ok: false, error: expect.any(String) }));
  });

  test('GET /api/rate-limit/status returns ok shape', async () => {
    const { default: router } = await import('../../routes/ops.js');
    const app = createContractApp({ mounts: [{ path: '/', router }] });
    const res = await request(app).get('/api/rate-limit/status').expect(200);
    expect(res.body).toEqual(expect.objectContaining({ ok: true, identifier: expect.any(String) }));
  });

  test('GET /api/active-indicator/:clientKey returns ok+counts', async () => {
    const { default: router } = await import('../../routes/ops.js');
    const app = createContractApp({ mounts: [{ path: '/', router }] });
    const res = await request(app).get('/api/active-indicator/c1').expect(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        ok: true,
        activeCalls: expect.any(Number),
        pendingFollowups: expect.any(Number),
        scheduledCalls: expect.any(Number)
      })
    );
  });

  test('GET /api/cache/stats returns success+stats shape', async () => {
    const { default: router } = await import('../../routes/ops.js');
    const app = createContractApp({ mounts: [{ path: '/', router }] });

    const res = await request(app).get('/api/cache/stats').expect(200);
    expect(res.body).toEqual(expect.objectContaining({ success: true }));
  });
});

