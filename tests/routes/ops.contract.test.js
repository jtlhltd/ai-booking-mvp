import { describe, expect, test, jest } from '@jest/globals';
import request from 'supertest';

import { createContractApp } from '../helpers/contract-harness.js';

jest.unstable_mockModule('../../lib/query-performance-tracker.js', () => ({
  getSlowQueries: jest.fn(async () => [{ q: 'select 1', duration_ms: 1200 }]),
  getQueryPerformanceStats: jest.fn(async () => ({ total: 1 })),
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

  test('GET /api/cache/stats returns success+stats shape', async () => {
    const { default: router } = await import('../../routes/ops.js');
    const app = createContractApp({ mounts: [{ path: '/', router }] });

    const res = await request(app).get('/api/cache/stats').expect(200);
    expect(res.body).toEqual(expect.objectContaining({ success: true }));
  });
});

