import { describe, test, expect, jest, beforeAll } from '@jest/globals';

const cache = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  clear: jest.fn().mockResolvedValue(undefined),
};

jest.unstable_mockModule('../../../lib/cache.js', () => ({
  getCache: () => cache,
}));

jest.unstable_mockModule('../../../lib/query-performance-tracker.js', () => ({
  trackQueryPerformance: jest.fn().mockResolvedValue(undefined),
}));

describe('db/query.js createQueryRunner', () => {
  let createQueryRunner;

  beforeAll(async () => {
    ({ createQueryRunner } = await import('../../../db/query.js'));
  });

  test('postgres path calls pool.query with params', async () => {
    cache.get.mockResolvedValueOnce(null);
    const pool = { query: jest.fn().mockResolvedValue({ rows: [{ id: 1 }] }) };
    const { query } = createQueryRunner(() => ({
      dbType: 'postgres',
      pool,
      sqlite: null,
      pgQueryLimiter: null,
    }));
    const res = await query('SELECT id FROM leads WHERE client_key = $1', ['c1']);
    expect(res.rows[0].id).toBe(1);
    expect(pool.query).toHaveBeenCalledWith('SELECT id FROM leads WHERE client_key = $1', ['c1']);
  });

  test('poolQuerySelect bypasses limiter and uses pool directly', async () => {
    const pool = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const { poolQuerySelect } = createQueryRunner(() => ({
      dbType: 'postgres',
      pool,
      sqlite: null,
      pgQueryLimiter: { run: jest.fn() },
    }));
    await poolQuerySelect('SELECT 1', []);
    expect(pool.query).toHaveBeenCalled();
  });
});
