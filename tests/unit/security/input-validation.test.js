import { describe, expect, test } from '@jest/globals';

describe('security: input validation primitives', () => {
  describe('validateEmail', () => {
    test.each(['test@example.com', 'user.name@domain.co.uk'])('accepts %s', async (email) => {
      const { validateEmail } = await import('../../../lib/utils.js');
      expect(validateEmail(email)).toBe(true);
    });

    test.each(['notanemail', '@domain.com', '', null, undefined])('rejects %s', async (email) => {
      const { validateEmail } = await import('../../../lib/utils.js');
      expect(validateEmail(email)).toBe(false);
    });
  });

  describe('validatePhone', () => {
    test.each(['+447491683261', '+442071234567'])('returns boolean for %s', async (phone) => {
      const { validatePhone } = await import('../../../lib/utils.js');
      expect(typeof validatePhone(phone)).toBe('boolean');
    });
  });

  describe('sanitizeString', () => {
    test('strips script tags but preserves content', async () => {
      const { sanitizeString } = await import('../../../lib/utils.js');
      const dirty = '<script>alert("xss")</script>Hello';
      const clean = sanitizeString(dirty);
      expect(clean).not.toMatch(/<script>/i);
      expect(clean).toContain('Hello');
    });

    test('mitigates SQL injection patterns', async () => {
      const { sanitizeString } = await import('../../../lib/utils.js');
      const malicious = "'; DROP TABLE users; --";
      const sanitized = sanitizeString(malicious);
      expect(sanitized).not.toMatch(/DROP/);
    });

    test('strips xss event handler payloads', async () => {
      const { sanitizeString } = await import('../../../lib/utils.js');
      const xss = '<img src=x onerror=alert(1)>';
      const sanitized = sanitizeString(xss);
      expect(sanitized).not.toMatch(/onerror/i);
    });
  });
});
