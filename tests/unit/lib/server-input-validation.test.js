import { describe, expect, test, jest } from '@jest/globals';
import {
  sanitizeLead,
  validatePhoneNumber,
  validateSmsBody,
  sanitizeInput,
  validateAndSanitizePhone,
  createSmsRateLimitMiddleware
} from '../../../lib/server-input-validation.js';

describe('lib/server-input-validation', () => {
  test('sanitizeLead maps fields', () => {
    expect(sanitizeLead(null)).toBeNull();
    expect(
      sanitizeLead({
        id: 1,
        name: 'n',
        phone: 'p',
        service: 's',
        status: 'st',
        source: 'so',
        notes: 'note'
      })
    ).toEqual({
      id: 1,
      name: 'n',
      phone: 'p',
      service: 's',
      status: 'st',
      source: 'so',
      lastMessage: 'note'
    });
  });

  test('validatePhoneNumber', () => {
    expect(validatePhoneNumber('')).toBe(false);
    expect(validatePhoneNumber('123')).toBe(false);
    expect(validatePhoneNumber('+15551234567')).toBe(true);
  });

  test('validateSmsBody', () => {
    expect(validateSmsBody('')).toBe(false);
    expect(validateSmsBody('hi')).toBe(true);
    expect(validateSmsBody('x'.repeat(1601))).toBe(false);
  });

  test('sanitizeInput strips and truncates', () => {
    expect(sanitizeInput(null)).toBe('');
    expect(sanitizeInput('  ab<>\r\n ', 4)).toBe('ab');
  });

  test('validateAndSanitizePhone', () => {
    expect(validateAndSanitizePhone('')).toBeNull();
    expect(validateAndSanitizePhone('+1 (555) 123-4567')).toContain('+');
  });

  test('createSmsRateLimitMiddleware', () => {
    let tick = 1;
    const nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => tick++);
    const mw = createSmsRateLimitMiddleware({ rateLimitWindowMs: 60000, maxRequests: 2 });
    const res429 = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    const req = { ip: '1.2.3.4', connection: {} };
    try {
      mw(req, res429, next);
      mw(req, res429, next);
      mw(req, res429, next);
      expect(next).toHaveBeenCalledTimes(2);
      expect(res429.status).toHaveBeenCalledWith(429);
    } finally {
      nowSpy.mockRestore();
    }
  });
});
