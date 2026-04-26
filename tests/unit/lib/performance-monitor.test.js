import { describe, expect, test, jest } from '@jest/globals';

describe('lib/performance-monitor', () => {
  test('tracks slow query + api error and generates report', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { PerformanceMonitor, performanceMiddleware, getPerformanceMonitor } = await import(
      '../../../lib/performance-monitor.js'
    );

    const pm = new PerformanceMonitor();
    pm.on('error', () => {}); // prevent EventEmitter unhandled 'error'
    const slowQuery = pm.trackQuery('SELECT 1', 2001);
    expect(slowQuery.slow).toBe(true);

    const api = pm.trackAPI('GET', '/x', 2500, 500);
    expect(api.slow).toBe(true);
    expect(api.error).toBe(true);

    pm.trackError(new Error('boom'), { where: 't' });
    const report = pm.generateReport();
    expect(report).toEqual(expect.objectContaining({ summary: expect.any(Object), topIssues: expect.any(Object) }));
    expect(report.recommendations.length).toBeGreaterThanOrEqual(1);

    // middleware wraps res.end
    const m = performanceMiddleware(pm);
    const req = { method: 'GET', path: '/p', get: () => 'v' };
    const res = { statusCode: 200, end: jest.fn() };
    m(req, res, () => {});
    res.end('ok');
    expect(pm.metrics.apiCalls.length).toBeGreaterThanOrEqual(2);

    // singleton
    expect(getPerformanceMonitor()).toBe(getPerformanceMonitor());

    warn.mockRestore();
    err.mockRestore();
  });
});

