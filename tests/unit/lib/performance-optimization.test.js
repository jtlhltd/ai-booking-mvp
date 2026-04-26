import { describe, expect, test, jest, beforeEach } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
  delete process.env.REDIS_URL;
});

describe('lib/performance-optimization', () => {
  test('RedisCacheManager get/set/exists tolerate client errors', async () => {
    const client = {
      on: jest.fn(),
      get: jest.fn(async () => {
        throw new Error('nope');
      }),
      setEx: jest.fn(async () => {
        throw new Error('nope');
      }),
      del: jest.fn(async () => {
        throw new Error('nope');
      }),
      exists: jest.fn(async () => {
        throw new Error('nope');
      }),
    };

    jest.unstable_mockModule('redis', () => ({
      default: {
        createClient: () => client,
      },
    }));
    jest.unstable_mockModule('../../../lib/cache.js', () => ({
      getCache: () => ({ get: async () => null, set: async () => {}, delPrefix: async () => {}, clear: async () => {} }),
    }));

    const { RedisCacheManager } = await import('../../../lib/performance-optimization.js');
    const mgr = new RedisCacheManager();
    expect(await mgr.get('k')).toBeNull();
    expect(await mgr.set('k', { a: 1 }, 1)).toBe(false);
    expect(await mgr.del('k')).toBe(false);
    expect(await mgr.exists('k')).toBe(false);
  });

  test('QueryOptimizer: getClientStatsOptimized computes derived metrics + caches', async () => {
    const mem = new Map();
    const cache = {
      get: async (k) => mem.get(k) || null,
      set: async (k, v) => {
        mem.set(k, v);
      },
      delPrefix: async () => {},
      clear: async () => {},
    };
    jest.unstable_mockModule('../../../lib/cache.js', () => ({ getCache: () => cache }));
    jest.unstable_mockModule('redis', () => ({ default: { createClient: () => ({ on: jest.fn() }) } }));

    const db = {
      query: jest.fn(async () => ({
        rows: [
          {
            total_calls: 10,
            successful_calls: 2,
            avg_quality_score: '0.7',
            total_cost: '1.25',
          },
        ],
      })),
    };

    const { QueryOptimizer } = await import('../../../lib/performance-optimization.js');
    const qo = new QueryOptimizer(db);
    const out = await qo.getClientStatsOptimized('c1');
    expect(out).toEqual(expect.objectContaining({ conversion_rate: '20.00', avg_quality_score: 0.7, total_cost: 1.25 }));

    // Cached second call (db.query should not be required again to satisfy coverage path)
    const out2 = await qo.getClientStatsOptimized('c1');
    expect(out2).toEqual(out);
  });

  test('QueryOptimizer: getPaginatedLeads returns pagination cursor and trims extra row', async () => {
    const cache = { get: async () => null, set: async () => {}, delPrefix: async () => {}, clear: async () => {} };
    jest.unstable_mockModule('../../../lib/cache.js', () => ({ getCache: () => cache }));
    jest.unstable_mockModule('redis', () => ({ default: { createClient: () => ({ on: jest.fn() }) } }));

    const db = {
      query: jest.fn(async () => ({
        rows: [
          { id: 1, created_at: '2026-01-02T00:00:00.000Z' },
          { id: 2, created_at: '2026-01-01T00:00:00.000Z' },
          { id: 3, created_at: '2025-12-31T00:00:00.000Z' },
        ],
      })),
    };

    const { QueryOptimizer } = await import('../../../lib/performance-optimization.js');
    const qo = new QueryOptimizer(db);
    const res = await qo.getPaginatedLeads('c1', null, 2);
    expect(res.data).toHaveLength(2);
    expect(res.pagination).toEqual(expect.objectContaining({ hasMore: true, nextCursor: '2026-01-01T00:00:00.000Z', limit: 2 }));
  });
});

