import { describe, expect, test, beforeEach, jest, afterEach } from '@jest/globals';

describe('lib/call-context-cache', () => {
  beforeEach(async () => {
    jest.useFakeTimers();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    const mod = await import('../../../lib/call-context-cache.js');
    mod.clearCallContextCache();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test('storeCallContext no-op without callId', async () => {
    const { storeCallContext, getCallContextCacheStats } = await import('../../../lib/call-context-cache.js');
    storeCallContext('', '+1', 'n');
    expect(getCallContextCacheStats().size).toBe(0);
  });

  test('store and get roundtrip', async () => {
    const { storeCallContext, getCallContext, clearCallContextCache } = await import(
      '../../../lib/call-context-cache.js'
    );
    storeCallContext('call-1', '+1555', 'Bob', { tenantKey: 'acme' });
    const ctx = getCallContext('call-1');
    expect(ctx?.phone).toBe('+1555');
    expect(ctx?.tenantKey).toBe('acme');
    clearCallContextCache();
    expect(getCallContext('call-1')).toBeNull();
  });

  test('getMostRecentCallContext picks latest tenant match', async () => {
    const { storeCallContext, getMostRecentCallContext, clearCallContextCache } = await import(
      '../../../lib/call-context-cache.js'
    );
    storeCallContext('a', '+1', 'x', { tenantKey: 't1', timestamp: 100 });
    storeCallContext('b', '+2', 'y', { tenantKey: 't1', timestamp: 200 });
    const recent = getMostRecentCallContext('t1');
    expect(recent?.callId).toBe('b');
    clearCallContextCache();
  });

  test('TTL cleanup removes entry', async () => {
    const { storeCallContext, getCallContext } = await import('../../../lib/call-context-cache.js');
    storeCallContext('expire-me', '+1', 'n', {});
    jest.advanceTimersByTime(11 * 60 * 1000);
    expect(getCallContext('expire-me')).toBeNull();
  });
});
