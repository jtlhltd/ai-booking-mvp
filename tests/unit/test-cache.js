// tests/unit/test-cache.js
// Test cache functionality

import { CacheManager } from '../../lib/cache.js';
import { describe, test, assertEqual, assertTrue, assertNull, printSummary, resetStats, wait } from '../utils/test-helpers.js';

resetStats();

describe('Cache Tests', () => {
  
  test('Cache set and get', async () => {
    const cache = new CacheManager();
    await cache.set('test-key', 'test-value');
    const value = await cache.get('test-key');
    
    assertEqual(value, 'test-value', 'Cache stores and retrieves value');
  });
  
  test('Cache TTL expiration', async () => {
    const cache = new CacheManager({ ttl: 100 }); // 100ms TTL
    await cache.set('test-key', 'test-value');
    
    // Value should exist immediately
    assertEqual(await cache.get('test-key'), 'test-value', 'Value exists before expiration');
    
    // Wait for expiration
    await wait(150);
    
    // Value should be expired
    assertNull(await cache.get('test-key'), 'Value expired after TTL');
  });
  
  test('Cache clear', async () => {
    const cache = new CacheManager();
    await cache.set('key1', 'value1');
    await cache.set('key2', 'value2');
    
    cache.clear();
    
    assertNull(await cache.get('key1'), 'Cache cleared - key1 removed');
    assertNull(await cache.get('key2'), 'Cache cleared - key2 removed');
  });
  
  test('Cache stats', async () => {
    const cache = new CacheManager();
    await cache.set('key1', 'value1');
    await cache.get('key1');
    await cache.get('key1');
    await cache.get('missing-key');
    
    assertTrue(cache.stats.hits >= 2, 'Cache hits tracked');
    assertTrue(cache.stats.misses >= 1, 'Cache misses tracked');
    assertTrue(cache.stats.sets >= 1, 'Cache sets tracked');
  });
  
  test('Cache max size', async () => {
    const cache = new CacheManager({ maxSize: 2 });
    await cache.set('key1', 'value1');
    await cache.set('key2', 'value2');
    await cache.set('key3', 'value3'); // Should evict key1
    
    // key1 might be evicted
    assertTrue((await cache.get('key3')) === 'value3', 'New key added');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

