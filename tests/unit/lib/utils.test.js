import { describe, expect, test } from '@jest/globals';

import { normalizePhoneE164, sanitizeString, validateEmail, validatePhone, isBusinessHours } from '../../../lib/utils.js';

describe('lib/utils', () => {
  test('normalizePhoneE164: null/empty -> null', () => {
    expect(normalizePhoneE164(null)).toBeNull();
    expect(normalizePhoneE164('')).toBeNull();
  });

  test('normalizePhoneE164: already E.164 passes', () => {
    expect(normalizePhoneE164('+447700900000')).toBe('+447700900000');
  });

  test('normalizePhoneE164: UK mobile formats normalize to +44', () => {
    expect(normalizePhoneE164('07700 900000')).toBe('+447700900000');
    expect(normalizePhoneE164('447700900000')).toBe('+447700900000');
    expect(normalizePhoneE164('00 44 7700 900000')).toBe('+447700900000');
  });

  test('sanitizeString strips obvious script and punctuation', () => {
    expect(sanitizeString('<script>alert(1)</script> hi')).toBe('hi');
    expect(sanitizeString('javascript:alert(1)')).toBe('alert(1)');
    expect(sanitizeString("DROP TABLE users; '\"")).toBe('TABLE users');
  });

  test('validateEmail basic', () => {
    expect(validateEmail('a@b.com')).toBe(true);
    expect(validateEmail('nope')).toBe(false);
  });

  test('validatePhone expects +44 then 10 digits', () => {
    expect(validatePhone('+447700900000')).toBe(true);
    expect(validatePhone('07700900000')).toBe(false);
  });

  test('isBusinessHours is Mon–Fri 9-17', () => {
    expect(isBusinessHours(new Date('2026-04-20T10:00:00Z'))).toBe(true); // Mon
    expect(isBusinessHours(new Date('2026-04-19T10:00:00Z'))).toBe(false); // Sun
  });
});

