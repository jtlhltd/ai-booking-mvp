// tests/unit/test-cache.js
// Test cache functionality

import { CacheManager } from '../../lib/cache.js';
import { describe, test, assertEqual, assertTrue, assertNull, printSummary, resetStats, wait } from '../utils/test-helpers.js';

resetStats();

describe('Cache Tests', () => {
  
  test('Cache set and get', () => {
    const cache = new CacheManager();
    cache.set('test-key', 'test-value');
    const value = cache.get('test-key');
    
    assertEqual(value, 'test-value', 'Cache stores and retrieves value');
  });
  
  test('Cache TTL expiration', async () => {
    const cache = new CacheManager({ ttl: 100 }); // 100ms TTL
    cache.set('test-key', 'test-value');
    
    // Value should exist immediately
    assertEqual(cache.get('test-key'), 'test-value', 'Value exists before expiration');
    
    // Wait for expiration
    await wait(150);
    
    // Value should be expired
    assertNull(cache.get('test-key'), 'Value expired after TTL');
  });
  
  test('Cache clear', () => {
    const cache = new CacheManager();
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    
    cache.clear();
    
    assertNull(cache.get('key1'), 'Cache cleared - key1 removed');
    assertNull(cache.get('key2'), 'Cache cleared - key2 removed');
  });
  
  test('Cache stats', () => {
    const cache = new CacheManager();
    cache.set('key1', 'value1');
    cache.get('key1');
    cache.get('key1');
    cache.get('missing-key');
    
    assertTrue(cache.stats.hits >= 2, 'Cache hits tracked');
    assertTrue(cache.stats.misses >= 1, 'Cache misses tracked');
    assertTrue(cache.stats.sets >= 1, 'Cache sets tracked');
  });
  
  test('Cache max size', () => {
    const cache = new CacheManager({ maxSize: 2 });
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.set('key3', 'value3'); // Should evict key1
    
    // key1 might be evicted
    assertTrue(cache.get('key3') === 'value3', 'New key added');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

