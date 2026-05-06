import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import {
  categorizeError,
  shouldRetryError,
  calculateRetryDelay,
  generateCostRecommendations
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
});
