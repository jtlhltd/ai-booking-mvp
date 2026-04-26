import { describe, expect, test } from '@jest/globals';
import { CacheManager, disconnectRedisClient } from '../../../lib/cache.js';

describe('cache CacheManager', () => {
  test('get/set/delete and stats in memory mode', async () => {
    const c = new CacheManager({ useRedis: false, maxSize: 100, ttl: 60_000 });
    expect(await c.get('x')).toBeNull();
    await c.set('x', { n: 1 });
    expect(await c.get('x')).toEqual({ n: 1 });
    expect(c.delete('x')).toBe(true);
    const st = c.getStats();
    expect(st.sets).toBeGreaterThan(0);
    expect(st.memoryUsage).toMatch(/B|KB|MB/);
  });

  test('evicts oldest entry when exceeding maxSize', async () => {
    const c = new CacheManager({ useRedis: false, maxSize: 1, ttl: 60_000 });
    await c.set('a', 1);
    await c.set('b', 2);
    expect(c.cache.size).toBe(1);
  });

  test('cleanup removes expired entries', async () => {
    const c = new CacheManager({ useRedis: false, maxSize: 50, ttl: 500 });
    await c.set('e', 99, 2);
    await new Promise((r) => setTimeout(r, 8));
    const removed = c.cleanup();
    expect(removed).toBeGreaterThanOrEqual(1);
  });

  test('invalidatePattern deletes matching keys', async () => {
    const c = new CacheManager({ useRedis: false, ttl: 60_000 });
    await c.set('pre:a', 1);
    await c.set('pre:b', 2);
    await c.set('other', 3);
    expect(c.invalidatePattern(/^pre:/)).toBe(2);
    expect(await c.get('other')).toBe(3);
  });

  test('disconnectRedisClient is safe when no redis', async () => {
    await expect(disconnectRedisClient()).resolves.toBeUndefined();
  });
});
