import { describe, expect, test, jest, afterEach } from '@jest/globals';
import { categorizeError, shouldRetryError, calculateRetryDelay } from '../../../lib/error-retry-policy.js';

describe('error-retry-policy', () => {
  test('categorizeError maps timeout message to network', () => {
    expect(categorizeError({ message: 'socket hang up: timeout' })).toBe('network');
  });

  test('categorizeError maps 429 to rate_limit', () => {
    expect(categorizeError({ message: 'x', status: 429 })).toBe('rate_limit');
  });

  test('categorizeError maps 503 to server_error', () => {
    expect(categorizeError({ message: 'x', status: 503 })).toBe('server_error');
  });

  test('categorizeError maps 404 to client_error', () => {
    expect(categorizeError({ message: 'not found', status: 404 })).toBe('client_error');
  });

  test('categorizeError maps unauthorized message to critical', () => {
    expect(categorizeError({ message: 'Unauthorized access' })).toBe('critical');
  });

  test('shouldRetryError rejects client_error', () => {
    expect(shouldRetryError('client_error', 1, 3)).toBe(false);
  });

  test('shouldRetryError allows network until maxRetries', () => {
    expect(shouldRetryError('network', 1, 3)).toBe(true);
    expect(shouldRetryError('network', 3, 3)).toBe(false);
  });

  test('shouldRetryError unknown retries once', () => {
    expect(shouldRetryError('unknown', 1, 3)).toBe(true);
    expect(shouldRetryError('unknown', 2, 3)).toBe(false);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('calculateRetryDelay applies rate_limit floor with stable jitter', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const d = calculateRetryDelay(1000, 1, 'rate_limit');
    expect(d).toBeGreaterThanOrEqual(5000);
  });
});
