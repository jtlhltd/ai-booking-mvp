/**
 * Determinism helpers for Jest (ESM).
 *
 * Use these to keep tests stable:
 * - time: freeze Date.now()
 * - randomness: freeze Math.random()
 */
import { jest } from '@jest/globals';

export function withFakeNow(epochMs, fn) {
  const spy = jest.spyOn(Date, 'now').mockReturnValue(epochMs);
  try {
    return fn();
  } finally {
    spy.mockRestore();
  }
}

export function withMockedMathRandom(value, fn) {
  const spy = jest.spyOn(Math, 'random').mockReturnValue(value);
  try {
    return fn();
  } finally {
    spy.mockRestore();
  }
}

