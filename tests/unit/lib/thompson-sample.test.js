import { describe, expect, test, jest } from '@jest/globals';
import { sampleGamma, sampleBeta } from '../../../lib/thompson-sample.js';

describe('thompson-sample', () => {
  test('sampleGamma returns 0 for non-positive shape', () => {
    expect(sampleGamma(0)).toBe(0);
    expect(sampleGamma(-1)).toBe(0);
  });

  test('sampleGamma returns finite values for common shapes', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.42);
    const g = sampleGamma(2);
    expect(Number.isFinite(g)).toBe(true);
    expect(g).toBeGreaterThanOrEqual(0);
    Math.random.mockRestore();
  });

  test('sampleBeta produces values in (0,1)', () => {
    for (let i = 0; i < 15; i++) {
      const b = sampleBeta(2, 5);
      expect(b).toBeGreaterThan(0);
      expect(b).toBeLessThan(1);
    }
  });
});
