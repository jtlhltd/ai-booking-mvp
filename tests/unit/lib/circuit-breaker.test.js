import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';

describe('lib/circuit-breaker', () => {
  const op = 'op_test';

  beforeEach(async () => {
    jest.resetModules();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    process.env.YOUR_EMAIL = '';
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('opens after threshold failures and then fails fast', async () => {
    const {
      withCircuitBreaker,
      isCircuitBreakerOpen,
      resetCircuitBreaker,
    } = await import('../../../lib/circuit-breaker.js');

    resetCircuitBreaker(op);

    const fn = jest.fn(async () => {
      throw new Error('boom');
    });

    // 5 failures should open (config failureThreshold=5)
    for (let i = 0; i < 5; i++) {
      await expect(withCircuitBreaker(op, fn)).rejects.toThrow('boom');
    }
    expect(isCircuitBreakerOpen(op)).toBe(true);

    await expect(withCircuitBreaker(op, jest.fn(async () => 'ok'))).rejects.toThrow(
      /Circuit breaker is open/,
    );
  });

  test('uses fallback when open and fallback succeeds', async () => {
    const { withCircuitBreaker, recordFailure, resetCircuitBreaker } = await import(
      '../../../lib/circuit-breaker.js'
    );

    resetCircuitBreaker(op);
    // Force open quickly by recording failures
    for (let i = 0; i < 5; i++) recordFailure(op, new Error('x'));

    const out = await withCircuitBreaker(
      op,
      async () => 'nope',
      async () => 'fallback_ok',
    );
    expect(out).toBe('fallback_ok');
  });

  test('throws helpful error when open and fallback fails', async () => {
    const { withCircuitBreaker, recordFailure, resetCircuitBreaker } = await import(
      '../../../lib/circuit-breaker.js'
    );

    resetCircuitBreaker(op);
    for (let i = 0; i < 5; i++) recordFailure(op, new Error('x'));

    await expect(
      withCircuitBreaker(
        op,
        async () => 'nope',
        async () => {
          throw new Error('fallback_bad');
        },
      ),
    ).rejects.toThrow(/fallback_bad/);
  });

  test('auto-recovers to half-open after timeout and closes after 2 successes', async () => {
    const {
      withCircuitBreaker,
      isCircuitBreakerOpen,
      recordFailure,
      resetCircuitBreaker,
    } = await import('../../../lib/circuit-breaker.js');

    resetCircuitBreaker(op);
    for (let i = 0; i < 5; i++) recordFailure(op, new Error('x'));
    expect(isCircuitBreakerOpen(op)).toBe(true);

    // advance past 60s timeout (config timeout=60000)
    jest.advanceTimersByTime(61000);

    // half-open should allow calls; two successes closes
    await expect(withCircuitBreaker(op, async () => 'a')).resolves.toBe('a');
    await expect(withCircuitBreaker(op, async () => 'b')).resolves.toBe('b');

    expect(isCircuitBreakerOpen(op)).toBe(false);
  });

  test('half-open failure re-opens circuit', async () => {
    const { recordFailure, isCircuitBreakerOpen, withCircuitBreaker, resetCircuitBreaker } = await import(
      '../../../lib/circuit-breaker.js'
    );

    resetCircuitBreaker(op);
    for (let i = 0; i < 5; i++) recordFailure(op, new Error('x'));
    jest.advanceTimersByTime(61000);

    await expect(
      withCircuitBreaker(op, async () => {
        throw new Error('boom2');
      }),
    ).rejects.toThrow('boom2');
    expect(isCircuitBreakerOpen(op)).toBe(true);
  });
});

