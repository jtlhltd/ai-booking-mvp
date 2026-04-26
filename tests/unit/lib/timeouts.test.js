import { describe, expect, test, jest, beforeEach } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
});

describe('lib/timeouts', () => {
  test('withTimeout resolves when promise resolves first', async () => {
    const { withTimeout } = await import('../../../lib/timeouts.js');
    await expect(withTimeout(Promise.resolve('ok'), 10, 'x')).resolves.toBe('ok');
  });

  test('withTimeout rejects on timeout and logs via error-monitoring (best effort)', async () => {
    jest.useFakeTimers();
    jest.unstable_mockModule('../../../lib/error-monitoring.js', () => ({
      logError: jest.fn(async () => {}),
    }));

    const { withTimeout } = await import('../../../lib/timeouts.js');
    const p = withTimeout(new Promise(() => {}), 5, 'op');
    const asserted = expect(p).rejects.toThrow(/timeout after 5ms/);
    await jest.advanceTimersByTimeAsync(10);
    await asserted;
    jest.useRealTimers();
  });

  test('fetchWithTimeout aborts and throws a friendly message', async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn(async (_url, opts) => {
      // wait until aborted
      await new Promise((_, reject) => {
        opts.signal.addEventListener('abort', () => {
          const e = new Error('aborted');
          e.name = 'AbortError';
          reject(e);
        });
      });
    });

    const { fetchWithTimeout } = await import('../../../lib/timeouts.js');
    const p = fetchWithTimeout('https://example.test', {}, 5);
    const asserted = expect(p).rejects.toThrow(/timed out after 5ms/);
    await jest.advanceTimersByTimeAsync(10);
    await asserted;
    jest.useRealTimers();
  });

  test('queryWithTimeout wraps queryFn in withTimeout', async () => {
    const { queryWithTimeout } = await import('../../../lib/timeouts.js');
    await expect(queryWithTimeout(async () => 123, 25)).resolves.toBe(123);
  });
});

