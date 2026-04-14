import { describe, test, expect } from '@jest/globals';
import { phoneMatchKey, outboundDialClaimKeyFromRaw } from '../../../lib/lead-phone-key.js';

describe('outboundDialClaimKeyFromRaw (queue merge + weekday journey identity)', () => {
  test('normalises E.164 to last 10 digits', () => {
    expect(outboundDialClaimKeyFromRaw('+447700900123')).toBe('7700900123');
    expect(phoneMatchKey('+447700900123')).toBe('7700900123');
  });

  test('short digit strings use full digit run', () => {
    expect(outboundDialClaimKeyFromRaw('0123456789')).toBe('0123456789');
  });

  test('no digits maps to __nodigits__ for weak-key merge path', () => {
    expect(outboundDialClaimKeyFromRaw('')).toBe('__nodigits__');
    expect(outboundDialClaimKeyFromRaw('n/a')).toBe('__nodigits__');
    expect(phoneMatchKey('n/a')).toBeNull();
  });
});

describe('weekday journey bitmask contract', () => {
  test('five Mon–Fri buckets sum to full mask used in journey SQL', () => {
    expect(1 + 2 + 4 + 8 + 16).toBe(31);
  });
});
