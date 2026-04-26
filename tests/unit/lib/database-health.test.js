import { describe, expect, test, jest, beforeEach } from '@jest/globals';

const query = jest.fn();

jest.unstable_mockModule('../../../db.js', () => ({ query }));

describe('database-health', () => {
  beforeEach(() => {
    jest.resetModules();
    query.mockReset();
  });

  test('checkDatabaseHealth returns healthy on success', async () => {
    query.mockResolvedValueOnce({ rows: [{ healthy: 1, timestamp: 't' }] }).mockResolvedValueOnce({ rows: [{ table_name: 'a' }] });
    const { checkDatabaseHealth, getLastHealthCheck } = await import('../../../lib/database-health.js');
    const h = await checkDatabaseHealth();
    expect(h.status).toBe('healthy');
    expect(getLastHealthCheck().status).toBe('healthy');
  });

  test('checkDatabaseHealth degrades then critical on repeated failures', async () => {
    query.mockRejectedValue(new Error('down'));
    const { checkDatabaseHealth } = await import('../../../lib/database-health.js');
    const a = await checkDatabaseHealth();
    expect(a.status).toBe('degraded');
    const b = await checkDatabaseHealth();
    expect(b.status).toMatch(/degraded|critical/);
    const c = await checkDatabaseHealth();
    expect(c.status).toBe('critical');
  });

  test('queryWithRetry succeeds after transient failures', async () => {
    query.mockRejectedValueOnce(new Error('t1')).mockRejectedValueOnce(new Error('t2')).mockResolvedValueOnce({ rows: [1] });
    const { queryWithRetry } = await import('../../../lib/database-health.js');
    const r = await queryWithRetry('SELECT 1', [], { maxRetries: 4, retryDelay: 0, operationName: 'unit' });
    expect(r.rows).toEqual([1]);
  });

  test('getConnectionLimit and getDatabaseStats map rows', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ max_connections: 100 }] })
      .mockResolvedValueOnce({ rows: [{ current_connections: 5 }] })
      .mockResolvedValueOnce({ rows: [{ state: 'active', count: 5 }] });
    const { getConnectionLimit } = await import('../../../lib/database-health.js');
    const c = await getConnectionLimit();
    expect(c.success).toBe(true);
    expect(c.maxConnections).toBe(100);

    query
      .mockResolvedValueOnce({ rows: [{ total_connections: '3' }] })
      .mockResolvedValueOnce({ rows: [{ schemaname: 'public', tablename: 't', size: '8 kB' }] })
      .mockResolvedValueOnce({ rows: [{ database_size: '1 MB' }] });
    const { getDatabaseStats } = await import('../../../lib/database-health.js');
    const s = await getDatabaseStats();
    expect(s.success).toBe(true);
  });

  test('getRemindersDue falls back when postgres query fails', async () => {
    query.mockRejectedValueOnce(new Error('pg')).mockResolvedValueOnce({ rows: [] });
    const { getRemindersDue } = await import('../../../lib/database-health.js');
    const r = await getRemindersDue(5);
    expect(r.rows).toEqual([]);
  });

  test('getFollowUpsDue falls back when postgres query fails', async () => {
    query.mockRejectedValueOnce(new Error('pg')).mockResolvedValueOnce({ rows: [] });
    const { getFollowUpsDue } = await import('../../../lib/database-health.js');
    const r = await getFollowUpsDue(3);
    expect(r.rows).toEqual([]);
  });
});
