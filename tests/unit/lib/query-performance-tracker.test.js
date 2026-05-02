import { describe, expect, test, jest, beforeEach } from '@jest/globals';

const query = jest.fn();
const sendCriticalAlert = jest.fn(async () => {});

jest.unstable_mockModule('../../../db.js', () => ({ query, dbType: 'postgres' }));
jest.unstable_mockModule('../../../lib/error-monitoring.js', () => ({ sendCriticalAlert }));
jest.unstable_mockModule('../../../lib/alert-email-throttle.js', () => ({
  reserveAlertEmailSlot: jest.fn(async () => true),
  GLOBAL_SLOW_QUERY_KEY: 'slow_query_critical'
}));

async function flushSetImmediate() {
  await new Promise((r) => setImmediate(r));
}

describe('query-performance-tracker', () => {
  beforeEach(() => {
    jest.resetModules();
    query.mockReset();
    sendCriticalAlert.mockReset();
  });

  test('trackQueryPerformance returns null for empty SQL', async () => {
    const { trackQueryPerformance } = await import('../../../lib/query-performance-tracker.js');
    expect(await trackQueryPerformance('   ', 500)).toBeNull();
  });

  test('trackQueryPerformance skips very fast queries', async () => {
    const { trackQueryPerformance } = await import('../../../lib/query-performance-tracker.js');
    expect(await trackQueryPerformance('SELECT id FROM leads WHERE x = 1', 50)).toBeNull();
  });

  test('trackQueryPerformance skips feedback-loop tables', async () => {
    const { trackQueryPerformance } = await import('../../../lib/query-performance-tracker.js');
    expect(await trackQueryPerformance('INSERT INTO query_performance (x) VALUES (1)', 500)).toBeNull();
  });

  test('trackQueryPerformance skips query_performance_daily', async () => {
    const { trackQueryPerformance } = await import('../../../lib/query-performance-tracker.js');
    expect(await trackQueryPerformance('INSERT INTO query_performance_daily (x) VALUES (1)', 500)).toBeNull();
  });

  test('trackQueryPerformance records slow generic SELECT', async () => {
    query.mockResolvedValueOnce({});
    const { trackQueryPerformance } = await import('../../../lib/query-performance-tracker.js');
    const r = await trackQueryPerformance('SELECT id FROM leads WHERE client_key = $1', 1200);
    expect(r?.isSlow).toBe(true);
    expect(r?.isCritical).toBe(false);
    await flushSetImmediate();
    await flushSetImmediate();
    expect(query).toHaveBeenCalled();
  });

  test('trackQueryPerformance flags critical queries and may alert', async () => {
    query.mockResolvedValue({});
    const { trackQueryPerformance } = await import('../../../lib/query-performance-tracker.js');
    const r = await trackQueryPerformance('SELECT name FROM clients WHERE id = $1', 8000);
    expect(r?.isCritical).toBe(true);
    await flushSetImmediate();
    await Promise.resolve();
    await Promise.resolve();
    expect(sendCriticalAlert).toHaveBeenCalled();
  });

  test('getSlowQueries maps rows', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          query_hash: 'h1',
          query_preview: 'select *',
          avg_duration: '1200',
          max_duration: '2000',
          call_count: '3',
          last_executed_at: '2026-01-01',
          created_at: '2026-01-01'
        }
      ]
    });
    const { getSlowQueries } = await import('../../../lib/query-performance-tracker.js');
    const rows = await getSlowQueries(5, 1000);
    expect(rows[0]).toMatchObject({ hash: 'h1', avgDuration: 1200, callCount: 3 });
  });

  test('getSlowQueries returns empty on error', async () => {
    query.mockRejectedValueOnce(new Error('db down'));
    const { getSlowQueries } = await import('../../../lib/query-performance-tracker.js');
    expect(await getSlowQueries()).toEqual([]);
  });

  test('getQueryPerformanceStats returns zeros when no rows', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const { getQueryPerformanceStats } = await import('../../../lib/query-performance-tracker.js');
    const s = await getQueryPerformanceStats();
    expect(s.totalQueries).toBe(0);
  });

  test('getQueryPerformanceStats parses aggregates', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          total_queries: '10',
          slow_queries: '2',
          critical_queries: '1',
          avg_duration: '150.5',
          max_duration: '900',
          total_calls: '40'
        }
      ]
    });
    const { getQueryPerformanceStats } = await import('../../../lib/query-performance-tracker.js');
    const s = await getQueryPerformanceStats();
    expect(s.slowQueries).toBe(2);
    expect(s.avgDuration).toBe(150.5);
  });

  test('getOptimizationRecommendations suggests LIMIT for ORDER BY', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          query_hash: 'h',
          query_preview: 'SELECT * FROM t ORDER BY id',
          avg_duration: '2000',
          max_duration: '2000',
          call_count: '101',
          last_executed_at: '2026-01-01',
          created_at: '2026-01-01'
        }
      ]
    });
    const { getOptimizationRecommendations } = await import('../../../lib/query-performance-tracker.js');
    const recs = await getOptimizationRecommendations();
    expect(recs.length).toBeGreaterThan(0);
    expect(recs[0].suggestions.some((s) => s.includes('LIMIT'))).toBe(true);
  });

  test('cleanupOldQueryData returns rowCount', async () => {
    query.mockResolvedValueOnce({ rowCount: 3 });
    const { cleanupOldQueryData } = await import('../../../lib/query-performance-tracker.js');
    expect(await cleanupOldQueryData(14)).toBe(3);
  });

  test('inferHeavyReadSurface tags demo_dashboard CTE shape', async () => {
    const { inferHeavyReadSurface } = await import('../../../lib/query-performance-tracker.js');
    expect(inferHeavyReadSurface('WITH lead_lookup AS (SELECT phone FROM leads) SELECT * FROM calls')).toBe(
      'demo_dashboard'
    );
  });

  test('getTopSlowQueryOffenders maps rows', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          query_hash: 'ab',
          query_preview: 'SELECT * FROM call_queue WHERE client_key = $1',
          avg_duration: 200,
          max_duration: 400,
          call_count: 5,
          last_executed_at: '2026-01-01'
        }
      ]
    });
    const { getTopSlowQueryOffenders } = await import('../../../lib/query-performance-tracker.js');
    const rows = await getTopSlowQueryOffenders({ limit: 10, windowHours: 24, minAvgMs: 100 });
    expect(rows[0]).toMatchObject({
      queryHash: 'ab',
      callCount: 5,
      inferredSurface: 'call_queue',
      score: 1000
    });
  });

  test('appendQueryPerformanceDailySnapshot swallows errors', async () => {
    query.mockRejectedValueOnce(new Error('no table'));
    const { appendQueryPerformanceDailySnapshot } = await import('../../../lib/query-performance-tracker.js');
    const out = await appendQueryPerformanceDailySnapshot();
    expect(out.ok).toBe(false);
  });
});
