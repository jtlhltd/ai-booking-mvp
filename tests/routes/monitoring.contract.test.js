import { describe, expect, test, jest } from '@jest/globals';
import request from 'supertest';

import { createContractApp } from '../helpers/contract-harness.js';

jest.unstable_mockModule('../../lib/performance-monitor.js', () => ({
  getPerformanceMonitor: () => ({
    getStats: () => ({ ok: true }),
    getSlowQueries: () => [],
    getSlowAPICalls: () => [],
    getRecentErrors: () => [],
    generateReport: () => ({ ok: true })
  })
}));

jest.unstable_mockModule('../../lib/cache.js', () => ({
  getCache: () => ({ getStats: () => ({ ok: true }), clear: () => {} })
}));

jest.unstable_mockModule('../../lib/structured-logger.js', () => ({
  getLogger: () => ({ info: () => {}, error: () => {} })
}));

jest.unstable_mockModule('../../db.js', () => ({
  query: jest.fn(async () => ({ rows: [{ total_tenants: 1 }] }))
}));

jest.unstable_mockModule('../../lib/query-performance-tracker.js', () => ({
  getTopSlowQueryOffenders: jest.fn(async () => [
    {
      queryHash: 'h1',
      queryPreview: 'SELECT 1',
      avgMs: 500,
      maxMs: 900,
      callCount: 4,
      evidenceNote: 'test',
      score: 2000,
      inferredSurface: 'other',
      lastExecutedAt: '2026-01-01'
    }
  ])
}));

describe('Monitoring routes contracts', () => {
  test('GET /api/monitoring/metrics returns expected shape', async () => {
    const { default: router } = await import('../../routes/monitoring.js');
    const app = createContractApp({ mounts: [{ path: '/', router }] });

    const res = await request(app).get('/api/monitoring/metrics').expect(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        timestamp: expect.any(String),
        performance: expect.any(Object),
        cache: expect.any(Object),
        system: expect.any(Object)
      })
    );
  });

  test('GET /api/monitoring/slow-queries/top returns offenders and no-store', async () => {
    const { default: router } = await import('../../routes/monitoring.js');
    const app = createContractApp({ mounts: [{ path: '/', router }] });

    const res = await request(app).get('/api/monitoring/slow-queries/top?limit=5').expect(200);
    expect(res.headers['cache-control']).toMatch(/no-store/i);
    expect(res.body).toEqual(
      expect.objectContaining({
        timestamp: expect.any(String),
        windowHours: expect.any(Number),
        minAvgMs: expect.any(Number),
        count: 1,
        offenders: expect.any(Array)
      })
    );
    expect(res.body.offenders[0]).toMatchObject({ queryHash: 'h1', inferredSurface: 'other' });
  });
});

