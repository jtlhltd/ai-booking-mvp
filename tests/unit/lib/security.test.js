import { describe, expect, test, jest, beforeEach } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
});

describe('security', () => {
  test('Encryption encrypt/decrypt roundtrip with stable key', async () => {
    process.env.ENCRYPTION_KEY = 'a'.repeat(64);
    const m = await import('../../../lib/security.js');
    const { Encryption } = m;
    const enc = Encryption.encrypt('hello');
    expect(typeof enc).toBe('string');
    expect(Encryption.decrypt(enc)).toBe('hello');
  });

  test('Encryption.decrypt returns null on invalid payload', async () => {
    process.env.ENCRYPTION_KEY = 'a'.repeat(64);
    const { Encryption } = await import('../../../lib/security.js');
    expect(Encryption.decrypt('not-a-valid-payload')).toBeNull();
  });

  test('AuditLogger stores logs and can detect rapid_requests anomaly', async () => {
    process.env.ENCRYPTION_KEY = 'a'.repeat(64);
    const { AuditLogger } = await import('../../../lib/security.js');
    const logger = new AuditLogger();

    const now = Date.now();
    jest.spyOn(Date, 'now').mockImplementation(() => now);

    for (let i = 0; i < 31; i++) {
      logger.log({ userId: 'u1', clientKey: 'c1', action: 'read', resource: '/x', success: true });
    }

    const anomalies = logger.detectAnomalies('u1');
    expect(anomalies.some((a) => a.type === 'rapid_requests')).toBe(true);
  });
});

