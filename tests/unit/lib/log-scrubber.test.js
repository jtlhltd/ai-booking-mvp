import { describe, expect, test, beforeEach, afterEach } from '@jest/globals';

describe('lib/log-scrubber', () => {
  let prevEnv;
  beforeEach(() => {
    prevEnv = process.env.NODE_ENV;
  });
  afterEach(() => {
    process.env.NODE_ENV = prevEnv;
  });

  test('redactPhone keeps last 4 digits', async () => {
    const { redactPhone } = await import('../../../lib/log-scrubber.js');
    expect(redactPhone('+447491683261')).toBe('…3261');
    expect(redactPhone('07491683261')).toBe('…3261');
    expect(redactPhone('1234')).toBe('***');
    expect(redactPhone('')).toBe('');
    expect(redactPhone(null)).toBe('');
  });

  test('redactEmail masks the local part', async () => {
    const { redactEmail } = await import('../../../lib/log-scrubber.js');
    expect(redactEmail('jonah@example.com')).toBe('jo***@example.com');
    expect(redactEmail('a@b.co')).toBe('a***@b.co');
    expect(redactEmail('not-an-email')).toBe('not-an-email');
    expect(redactEmail('')).toBe('');
  });

  test('scrubBody is pass-through in non-prod', async () => {
    process.env.NODE_ENV = 'development';
    const { scrubBody } = await import('../../../lib/log-scrubber.js');
    const body = { phone: '+447491683261', email: 'a@b.co', name: 'Jane' };
    expect(scrubBody(body)).toEqual(body);
  });

  test('scrubBody redacts PII keys in production', async () => {
    process.env.NODE_ENV = 'production';
    const { scrubBody } = await import('../../../lib/log-scrubber.js');
    const out = scrubBody({
      phone: '+447491683261',
      email: 'jane@example.com',
      ownerEmail: 'owner@example.com',
      apiKey: 'sk_secret_123',
      password: 'hunter2',
      name: 'Jane',
      nested: { phone: '+447900900900', address: '10 Downing Street' },
    });
    expect(out.phone).toBe('…3261');
    expect(out.email).toBe('ja***@example.com');
    expect(out.ownerEmail).toBe('ow***@example.com');
    expect(out.apiKey).toBe('[redacted]');
    expect(out.password).toBe('[redacted]');
    expect(out.name).toBe('Jane');
    expect(out.nested.phone).toBe('…0900');
  });

  test('scrubBody redacts PII inside free-text strings in production', async () => {
    process.env.NODE_ENV = 'production';
    const { scrubBody } = await import('../../../lib/log-scrubber.js');
    const out = scrubBody({ note: 'Call jane@example.com on +447491683261 at 9am' });
    expect(out.note).toContain('ja***@example.com');
    expect(out.note).toContain('…3261');
    expect(out.note).not.toContain('jane@example.com');
    expect(out.note).not.toContain('7491683261');
  });
});
