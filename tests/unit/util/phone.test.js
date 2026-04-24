import { describe, expect, test } from '@jest/globals';

import { normalizePhone } from '../../../util/phone.js';

describe('util/phone', () => {
  test('returns input for null/undefined/empty', () => {
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone(undefined)).toBeUndefined();
    expect(normalizePhone('')).toBe('');
  });

  test('normalizes UK numbers by default to +44', () => {
    expect(normalizePhone('07491683261')).toBe('+447491683261');
    expect(normalizePhone('447491683261')).toBe('+447491683261');
  });

  test('keeps leading + numbers', () => {
    expect(normalizePhone('+447491683261')).toBe('+447491683261');
  });
});

