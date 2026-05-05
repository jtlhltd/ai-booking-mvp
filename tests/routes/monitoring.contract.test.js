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
});

