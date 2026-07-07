import { describe, expect, test, jest, beforeEach } from '@jest/globals';

const query = jest.fn();
const pool = { query: jest.fn() };
const sendCriticalAlert = jest.fn(async () => {});
let mockDbType = 'sqlite';

jest.unstable_mockModule('../../../db.js', () => ({ query, pool, dbType: mockDbType }));
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
    pool.query.mockReset();
    mockDbType = 'sqlite';
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

  test('trackQueryPerformance batches metric upserts through raw pg pool when available', async () => {
    mockDbType = 'post' + 'gres';
    pool.query.mockResolvedValue({});
    const { trackQueryPerformance } = await import('../../../lib/query-performance-tracker.js');

    await trackQueryPerformance('SELECT id FROM leads WHERE client_key = $1', 1200);
    await trackQueryPerformance('SELECT id FROM calls WHERE client_key = $1', 1400);
    await flushSetImmediate();
    await Promise.resolve();

    expect(query).not.toHaveBeenCalled();
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(String(pool.query.mock.calls[0][0])).toContain('VALUES ($1, $2, $3, $4, $5, NOW()), ($6, $7, $8, $9, $10, NOW())');
    expect(pool.query.mock.calls[0][1]).toHaveLength(10);
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

  test('trackQueryPerformance skips call_queue stale self-heal (pool wait, not SQL)', async () => {
    query.mockResolvedValue({});
    const { trackQueryPerformance } = await import('../../../lib/query-performance-tracker.js');
    const r = await trackQueryPerformance(
      `WITH stale AS (
        SELECT id FROM call_queue
        WHERE status = 'processing' AND updated_at < NOW() - INTERVAL '10 minutes'
        ORDER BY updated_at ASC LIMIT 500
      )
      UPDATE call_queue cq SET status = 'pending', updated_at = NOW()
      FROM stale WHERE cq.id = stale.id`,
      8000
    );
    expect(r).toBeNull();
    await flushSetImmediate();
    await Promise.resolve();
    expect(sendCriticalAlert).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  test('trackQueryPerformance skips tenants full config read (pool wait, not SQL)', async () => {
    query.mockResolvedValue({});
    const { trackQueryPerformance } = await import('../../../lib/query-performance-tracker.js');
    const r = await trackQueryPerformance(
      `SELECT client_key, display_name, timezone, locale,
         numbers_json, twilio_json, vapi_json, calendar_json, sms_templates_json,
         white_label_config, outbound_sequence_json, is_enabled, created_at
       FROM tenants WHERE client_key = $1`,
      8000
    );
    expect(r).toBeNull();
    await flushSetImmediate();
    await Promise.resolve();
    expect(sendCriticalAlert).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  test('trackQueryPerformance skips ops invariants call_queue bounds check (pool wait, not SQL)', async () => {
    query.mockResolvedValue({});
    const { trackQueryPerformance } = await import('../../../lib/query-performance-tracker.js');
    const r = await trackQueryPerformance(
      `WITH bounds AS (
        SELECT
          ((date_trunc('day', NOW() AT TIME ZONE $2) + INTERVAL '1 day') AT TIME ZONE $2) AS t0,
          ((date_trunc('day', NOW() AT TIME ZONE $2) + INTERVAL '2 day') AT TIME ZONE $2) AS t1
      )
      SELECT COALESCE(MAX(c), 0)::int AS max_per_exact_hour
      FROM (
        SELECT scheduled_for, COUNT(*)::int AS c
        FROM call_queue cq
        CROSS JOIN bounds b
        WHERE cq.client_key = $1
          AND cq.call_type = 'vapi_call'
          AND cq.status = 'pending'
          AND cq.scheduled_for >= b.t0
          AND cq.scheduled_for < b.t1
          AND EXTRACT(MINUTE FROM (cq.scheduled_for AT TIME ZONE $2)) = 0
          AND EXTRACT(SECOND FROM (cq.scheduled_for AT TIME ZONE $2)) = 0
        GROUP BY 1
      ) x`,
      8000
    );
    expect(r).toBeNull();
    await flushSetImmediate();
    await Promise.resolve();
    expect(sendCriticalAlert).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  test('trackQueryPerformance skips retry_queue appointment_reminder due poll (pool wait, not SQL)', async () => {
    query.mockResolvedValue({});
    const { trackQueryPerformance } = await import('../../../lib/query-performance-tracker.js');
    const r = await trackQueryPerformance(
      `WITH picked AS (
        SELECT id FROM retry_queue
        WHERE retry_reason LIKE 'appointment\\_reminder%' ESCAPE '\\'
          AND status = 'pending'
          AND scheduled_for <= NOW() + ($1::int * INTERVAL '1 minute')
        ORDER BY scheduled_for ASC LIMIT 50
      )
      SELECT rq.id FROM retry_queue rq INNER JOIN picked p ON p.id = rq.id`,
      8000
    );
    expect(r).toBeNull();
    await flushSetImmediate();
    await Promise.resolve();
    expect(sendCriticalAlert).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  test('trackQueryPerformance skips webhook retry_queue due poll (pool wait, not SQL)', async () => {
    query.mockResolvedValue({});
    const { trackQueryPerformance } = await import('../../../lib/query-performance-tracker.js');
    const r = await trackQueryPerformance(
      `SELECT * FROM retry_queue
       WHERE retry_type LIKE 'webhook_%' AND status = 'pending'
         AND scheduled_for <= NOW() AND retry_attempt <= max_retries
       ORDER BY scheduled_for ASC LIMIT 10`,
      8000
    );
    expect(r).toBeNull();
    await flushSetImmediate();
    await Promise.resolve();
    expect(sendCriticalAlert).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  test('trackQueryPerformance skips rate_limit_tracking cleanup DELETE (pool wait, not SQL)', async () => {
    query.mockResolvedValue({});
    const { trackQueryPerformance } = await import('../../../lib/query-performance-tracker.js');
    const r = await trackQueryPerformance(
      `DELETE FROM rate_limit_tracking WHERE window_start < now() - interval '24 hours'`,
      8000
    );
    expect(r).toBeNull();
    await flushSetImmediate();
    await Promise.resolve();
    expect(sendCriticalAlert).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  test('trackQueryPerformance skips appointment_reminders pending poll (pool wait, not SQL)', async () => {
    query.mockResolvedValue({});
    const { trackQueryPerformance } = await import('../../../lib/query-performance-tracker.js');
    const r = await trackQueryPerformance(
      `SELECT * FROM appointment_reminders
       WHERE status = 'pending' AND scheduled_for <= NOW()
       ORDER BY scheduled_for ASC LIMIT 50`,
      8000
    );
    expect(r).toBeNull();
    await flushSetImmediate();
    await Promise.resolve();
    expect(sendCriticalAlert).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
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
});
