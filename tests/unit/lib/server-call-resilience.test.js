import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import {
  categorizeError,
  shouldRetryError,
  calculateRetryDelay,
  generateCostRecommendations,
  updateCircuitBreakerState,
  isCircuitBreakerOpen,
  retryWithBackoff
} from '../../../lib/server-call-resilience.js';

describe('lib/server-call-resilience', () => {
  beforeEach(() => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('categorizeError maps common patterns', () => {
    expect(categorizeError({ message: 'ECONNRESET', status: undefined })).toBe('network');
    expect(categorizeError({ message: 'rate limit exceeded', status: 429 })).toBe('rate_limit');
    expect(categorizeError({ message: 'x', status: 503 })).toBe('server_error');
    expect(categorizeError({ message: 'x', status: 404 })).toBe('client_error');
    expect(categorizeError({ message: 'invalid Vapi assistant', status: undefined })).toBe('vapi_error');
    expect(categorizeError({ message: 'forbidden', status: undefined })).toBe('critical');
    expect(categorizeError({ message: '???', status: undefined })).toBe('unknown');
  });

  test('shouldRetryError respects attempt caps', () => {
    expect(shouldRetryError('network', 1, 3)).toBe(true);
    expect(shouldRetryError('network', 3, 3)).toBe(false);
    expect(shouldRetryError('client_error', 1, 3)).toBe(false);
    expect(shouldRetryError('unknown', 1, 3)).toBe(true);
    expect(shouldRetryError('unknown', 2, 3)).toBe(false);
  });

  test('calculateRetryDelay bumps rate_limit delay floor', () => {
    const d = calculateRetryDelay(1000, 2, 'rate_limit');
    expect(d).toBeGreaterThanOrEqual(5000);
  });

  test('generateCostRecommendations returns entries when spend present', () => {
    const rec = generateCostRecommendations(
      { total_cost: 10, transaction_count: 5 },
      { vapi_calls: { daily: { percentage: 85 } } }
    );
    expect(rec.length).toBeGreaterThan(0);
    expect(rec.some((r) => r.type === 'cost_optimization')).toBe(true);
  });

  test('circuit breaker opens and recovers to half-open after timeout', async () => {
    jest.useFakeTimers();
    await updateCircuitBreakerState('canary-op', 'open');
    expect(isCircuitBreakerOpen('canary-op')).toBe(true);
    jest.advanceTimersByTime(5 * 60 * 1000 + 1);
    expect(isCircuitBreakerOpen('canary-op')).toBe(false);
    jest.useRealTimers();
  });

  test('retryWithBackoff succeeds on first attempt', async () => {
    const fn = jest.fn(async () => 'ok');
    await expect(retryWithBackoff(fn, 3, 100, { operation: 'canary-retry' })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('retryWithBackoff rejects when circuit breaker is open', async () => {
    await updateCircuitBreakerState('blocked-canary', 'open');
    await expect(
      retryWithBackoff(async () => 'x', 3, 100, { operation: 'blocked-canary' })
    ).rejects.toThrow(/Circuit breaker is open/);
  });
});
