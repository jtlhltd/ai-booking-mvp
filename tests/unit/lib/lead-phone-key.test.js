import { describe, expect, test } from '@jest/globals';

import {
  phoneMatchKey,
  outboundDialClaimKeyFromRaw,
  pgLeadPhoneKeyExpr,
  pgQueueLeadPhoneKeyExpr
} from '../../../lib/lead-phone-key.js';

describe('lib/lead-phone-key', () => {
  test('phoneMatchKey normalizes to last 10 digits', () => {
    expect(phoneMatchKey('+44 7700 900000')).toBe('7700900000');
    expect(phoneMatchKey('07700900000')).toBe('7700900000');
  });

  test('phoneMatchKey returns full digits when shorter than 10', () => {
    expect(phoneMatchKey('12345')).toBe('12345');
  });

  test('outboundDialClaimKeyFromRaw falls back to __nodigits__', () => {
    expect(outboundDialClaimKeyFromRaw('no digits here')).toBe('__nodigits__');
  });

  test('pgLeadPhoneKeyExpr emits a CASE expression', () => {
    const expr = pgLeadPhoneKeyExpr('l.phone');
    expect(expr).toMatch(/CASE WHEN LENGTH/i);
    expect(expr).toMatch(/RIGHT\(/i);
  });

  test('pgQueueLeadPhoneKeyExpr includes __nodigits__ fallback', () => {
    const expr = pgQueueLeadPhoneKeyExpr('cq.lead_phone');
    expect(expr).toMatch(/__nodigits__/);
  });
});

