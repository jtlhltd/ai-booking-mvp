import { describe, expect, test, jest, beforeEach } from '@jest/globals';

import {
  RetryConfig,
  RetryManager,
  CircuitBreaker,
  TimeoutManager,
  BulkOperationManager
} from '../../../lib/retry-logic.js';

beforeEach(() => {
  jest.restoreAllMocks();
});

describe('retry-logic', () => {
  test('RetryConfig.calculateDelay is deterministic when jitter=false', () => {
    const cfg = new RetryConfig({ baseDelay: 1000, backoffMultiplier: 2, jitter: false, maxDelay: 999999 });
    expect(cfg.calculateDelay(1)).toBe(1000);
    expect(cfg.calculateDelay(2)).toBe(2000);
    expect(cfg.calculateDelay(3)).toBe(4000);
  });

  test('RetryConfig.defaultRetryCondition retries network errors, 5xx, and 429', () => {
    const cfg = new RetryConfig();

    const net = new Error('net');
    net.code = 'ECONNREFUSED';
    expect(cfg.defaultRetryCondition(net)).toBe(true);

    const s500 = new Error('server');
    s500.status = 503;
    expect(cfg.defaultRetryCondition(s500)).toBe(true);

    const s429 = new Error('rate');
    s429.status = 429;
    expect(cfg.defaultRetryCondition(s429)).toBe(true);

    const s400 = new Error('bad');
    s400.status = 400;
    expect(cfg.defaultRetryCondition(s400)).toBe(false);
  });

  test('RetryConfig.calculateDelay caps at maxDelay and applies jitter range', () => {
    const randSpy = jest.spyOn(Math, 'random').mockReturnValue(0); // => factor 0.5
    const cfg = new RetryConfig({ baseDelay: 1000, backoffMultiplier: 10, jitter: true, maxDelay: 3000 });
    // attempt=2 => baseDelay*10 => 10000 capped to 3000 then jitter => 1500
    expect(cfg.calculateDelay(2)).toBe(1500);

    randSpy.mockReturnValue(0.999999); // => approx factor 1.0
    const v = cfg.calculateDelay(2);
    expect(v).toBeGreaterThanOrEqual(2999);
    expect(v).toBeLessThanOrEqual(3000);

    randSpy.mockRestore();
  });

  test('RetryManager.execute retries retryable errors then succeeds (fake timers)', async () => {
    jest.useFakeTimers();
    const mgr = new RetryManager({ maxRetries: 3, baseDelay: 10, backoffMultiplier: 2, jitter: false });

    let calls = 0;
    const fn = jest.fn(async () => {
      calls += 1;
      if (calls < 3) {
        const e = new Error('nope');
        e.status = 500;
        throw e;
      }
      return 'ok';
    });

    const p = mgr.execute(fn, { operation: 't' });
    await jest.advanceTimersByTimeAsync(10);
    await jest.advanceTimersByTimeAsync(20);
    await expect(p).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
    jest.useRealTimers();
  });

  test('RetryManager.execute does not retry non-retryable errors', async () => {
    const mgr = new RetryManager({ maxRetries: 5, jitter: false });
    const fn = jest.fn(async () => {
      const e = new Error('bad request');
      e.status = 400;
      throw e;
    });
    await expect(mgr.execute(fn, { operation: 't' })).rejects.toThrow('bad request');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('RetryManager.execute throws after exhausting retries for retryable errors', async () => {
    jest.useFakeTimers();
    const mgr = new RetryManager({ maxRetries: 3, baseDelay: 10, backoffMultiplier: 2, jitter: false });
    const fn = jest.fn(async () => {
      const e = new Error('nope');
      e.status = 500;
      throw e;
    });

    const p = mgr.execute(fn, { operation: 't' });
    // Attach handler immediately to avoid PromiseRejectionHandledWarning under fake timers.
    const handled = p.then(() => null).catch((e) => e);
    await jest.advanceTimersByTimeAsync(10);
    await jest.advanceTimersByTimeAsync(20);
    const err = await handled;
    expect(err).toBeInstanceOf(Error);
    expect(String(err.message)).toBe('nope');
    expect(fn).toHaveBeenCalledTimes(3);
    jest.useRealTimers();
  });

  test('CircuitBreaker opens after threshold and blocks until resetTimeout', async () => {
    jest.useFakeTimers();
    const cb = new CircuitBreaker({ failureThreshold: 2, resetTimeout: 1000 });
    const failing = async () => {
      throw new Error('fail');
    };

    await expect(cb.execute(failing, { operation: 'x' })).rejects.toThrow('fail');
    await expect(cb.execute(failing, { operation: 'x' })).rejects.toThrow('fail');

    // now open
    await expect(cb.execute(async () => 'ok', { operation: 'x' })).rejects.toThrow(/Circuit breaker is OPEN/i);

    await jest.advanceTimersByTimeAsync(1000);
    await expect(cb.execute(async () => 'ok', { operation: 'x' })).resolves.toBe('ok');
    jest.useRealTimers();
  });

  test('TimeoutManager.execute rejects after timeout', async () => {
    jest.useFakeTimers();
    const tm = new TimeoutManager(50);
    const p = tm.execute(async () => new Promise(() => {}), 50, { operation: 'hang' });
    // Attach a handler immediately to avoid unhandled rejection warnings under fake timers.
    const handled = p.then(() => null).catch((e) => e);
    await jest.advanceTimersByTimeAsync(60);
    const err = await handled;
    expect(err).toBeInstanceOf(Error);
    expect(String(err.message)).toMatch(/timeout/i);
    jest.useRealTimers();
  });

  test('BulkOperationManager returns successes and errors', async () => {
    const bulk = new BulkOperationManager({ concurrency: 2, retryConfig: { maxRetries: 1, jitter: false } });
    const operations = [
      { name: 'a', fn: async () => 1 },
      { name: 'b', fn: async () => { throw new Error('b'); } },
      { name: 'c', fn: async () => 3 }
    ];
    const out = await bulk.executeBulk(operations, { operation: 'bulk' });
    expect(out.totalCount).toBe(3);
    expect(out.successCount).toBe(2);
    expect(out.errorCount).toBe(1);
  });
});

