import { describe, expect, test, jest } from '@jest/globals';
import {
  asJson,
  hoursFor,
  withRetry,
  isDemoClient,
  calculateCacheHitRate
} from '../../../lib/server-runtime-helpers.js';

describe('lib/server-runtime-helpers', () => {
  test('asJson', () => {
    expect(asJson(null, {})).toEqual({});
    expect(asJson({ a: 1 }, {})).toEqual({ a: 1 });
    expect(asJson('{"b":2}', {})).toEqual({ b: 2 });
    expect(asJson('not-json', [1])).toEqual([1]);
  });

  test('hoursFor prefers booking hours', () => {
    expect(hoursFor({ booking: { hours: { mon: ['10:00-11:00'] } } })).toEqual({
      mon: ['10:00-11:00']
    });
    expect(hoursFor({ hoursJson: '{"tue":["09:00-17:00"]}' })).toEqual({ tue: ['09:00-17:00'] });
    expect(hoursFor({})?.mon?.length).toBeGreaterThan(0);
  });

  test('withRetry retries on 429', async () => {
    let n = 0;
    const fn = jest.fn(async () => {
      n++;
      if (n < 2) {
        const e = new Error('rate');
        e.response = { status: 429 };
        throw e;
      }
      return 'ok';
    });
    await expect(withRetry(fn, { retries: 2, delayMs: 1 })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test('withRetry throws when not retriable', async () => {
    const fn = jest.fn(async () => {
      const e = new Error('bad');
      e.response = { status: 400 };
      throw e;
    });
    await expect(withRetry(fn, { retries: 2, delayMs: 1 })).rejects.toThrow('bad');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('isDemoClient', () => {
    expect(isDemoClient(null)).toBe(false);
    expect(isDemoClient({ clientKey: 'demo-x' })).toBe(true);
    expect(isDemoClient({ clientKey: 'demo-client' })).toBe(true);
    expect(isDemoClient({ clientKey: 'acme', isDemo: true })).toBe(true);
  });

  test('calculateCacheHitRate', () => {
    expect(calculateCacheHitRate({ cache: new Map() }, 't')).toBe(0);
    const map = new Map();
    map.set('cache:t:1', true);
    expect(calculateCacheHitRate(map, 't')).toBeGreaterThan(0);
  });
});
