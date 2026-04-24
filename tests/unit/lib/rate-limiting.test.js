import { describe, expect, test, jest, beforeEach } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
});

describe('rate-limiting', () => {
  test('checkRateLimit limits per identifier+endpoint (not global)', async () => {
    // Import fresh module to reset the internal Map.
    const { checkRateLimit, clearRateLimitData } = await import('../../../lib/rate-limiting.js');
    clearRateLimitData();

    const config = { windowMs: 60000, max: 2, name: 't' };
    const a1 = await checkRateLimit('id1', '/api/x', config);
    const a2 = await checkRateLimit('id1', '/api/x', config);
    const a3 = await checkRateLimit('id1', '/api/x', config);
    expect(a1.allowed).toBe(true);
    expect(a2.allowed).toBe(true);
    expect(a3.allowed).toBe(false);

    // Different identifier should not be affected by id1's requests.
    const b1 = await checkRateLimit('id2', '/api/x', config);
    const b2 = await checkRateLimit('id2', '/api/x', config);
    expect(b1.allowed).toBe(true);
    expect(b2.allowed).toBe(true);

    // Different endpoint should not be affected by /api/x's requests.
    const c1 = await checkRateLimit('id1', '/api/y', config);
    expect(c1.allowed).toBe(true);
  });
});

