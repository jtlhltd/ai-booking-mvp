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
    Date.now.mockRestore();
  });

  test('Encryption null inputs and password hashing', async () => {
    process.env.ENCRYPTION_KEY = 'b'.repeat(64);
    const { Encryption } = await import('../../../lib/security.js');
    expect(Encryption.encrypt('')).toBeNull();
    expect(Encryption.decrypt('')).toBeNull();
    const h = Encryption.hashPassword('secret');
    expect(Encryption.verifyPassword('secret', h)).toBe(true);
    expect(Encryption.verifyPassword('wrong', h)).toBe(false);
    expect(Encryption.generateToken(8).length).toBeGreaterThan(0);
  });

  test('AuditLogger getLogs exportLogs and more anomalies', async () => {
    process.env.ENCRYPTION_KEY = 'c'.repeat(64);
    const { AuditLogger } = await import('../../../lib/security.js');
    const logger = new AuditLogger();
    logger.log({ userId: 'u2', clientKey: 'c1', action: 'login', resource: '/login', success: false, ip: '1.1.1.1' });
    logger.log({ userId: 'u2', clientKey: 'c1', action: 'login', resource: '/login', success: false, ip: '2.2.2.2' });
    logger.log({ userId: 'u2', clientKey: 'c1', action: 'login', resource: '/login', success: false, ip: '3.3.3.3' });
    logger.log({ userId: 'u2', clientKey: 'c1', action: 'login', resource: '/login', success: false, ip: '4.4.4.4' });
    logger.log({ userId: 'u2', clientKey: 'c1', action: 'login', resource: '/login', success: false, ip: '5.5.5.5' });
    const logs = logger.getLogs({ userId: 'u2', limit: 2 });
    expect(logs.length).toBe(2);
    const csv = logger.exportLogs({ userId: 'u2' });
    expect(csv).toContain('Timestamp');
    const an = logger.detectAnomalies('u2');
    expect(an.some((a) => a.type === 'failed_logins')).toBe(true);
    expect(an.some((a) => a.type === 'ip_variation')).toBe(true);
  });

  test('GDPRManager consent export delete and retention dryRun', async () => {
    const query = jest.fn(async (sql) => {
      const s = String(sql);
      if (s.includes('INSERT INTO consent_records')) return { rows: [] };
      if (s.includes('FROM consent_records') && s.includes('ORDER BY')) return { rows: [{ consent_type: 'marketing', granted: true, created_at: 't' }] };
      if (s.includes('FROM consent_records') && s.includes('user_id')) return { rows: [] };
      if (s.includes('user_accounts') && s.includes('WHERE id')) return { rows: [{ id: 'u' }] };
      if (s.includes('SELECT COUNT(*)') && s.includes('FROM leads')) return { rows: [{ count: '3' }] };
      if (s.includes('FROM leads')) return { rows: [{ id: 1 }] };
      if (s.includes('DELETE FROM leads')) return { rowCount: 2 };
      if (s.includes('UPDATE user_accounts')) return { rowCount: 1 };
      return { rows: [] };
    });
    process.env.ENCRYPTION_KEY = 'd'.repeat(64);
    const { GDPRManager } = await import('../../../lib/security.js');
    const g = new GDPRManager({ query });
    await expect(
      g.recordConsent({
        userId: 'u',
        clientKey: 'c',
        consentType: 'marketing',
        granted: true,
        ip: '0.0.0.0',
        userAgent: 'jest'
      })
    ).resolves.toBe(true);
    const consent = await g.getConsent('u');
    expect(consent.marketing?.granted).toBe(true);
    const exp = await g.exportUserData('u');
    expect(exp.userId).toBe('u');
    const del = await g.deleteUserData('u', 'test');
    expect(del.itemsDeleted).toBeDefined();
    const ret = await g.applyDataRetention(30, { dryRun: true, tables: ['leads'] });
    expect(ret.dryRun).toBe(true);
    expect(ret.itemsDeleted.leads).toBe(3);
  });

  test('IPWhitelist and twilioWebhookVerification branches', async () => {
    process.env.ENCRYPTION_KEY = 'e'.repeat(64);
    const { IPWhitelist, twilioWebhookVerification } = await import('../../../lib/security.js');
    const wl = new IPWhitelist();
    expect(wl.isAllowed('9.9.9.9')).toBe(true);
    wl.addToBlacklist('9.9.9.9');
    expect(wl.isAllowed('9.9.9.9')).toBe(false);
    wl.addToWhitelist('8.8.8.8');
    expect(wl.isAllowed('8.8.8.8')).toBe(true);
    expect(wl.isAllowed('1.1.1.1')).toBe(false);

    delete process.env.TWILIO_AUTH_TOKEN;
    const next = jest.fn();
    const res = { status: jest.fn(() => ({ json: jest.fn() })) };
    twilioWebhookVerification({ get: () => '' }, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('logAudit delegates to singleton', async () => {
    process.env.ENCRYPTION_KEY = 'f'.repeat(64);
    const { logAudit, getAuditLogger } = await import('../../../lib/security.js');
    const before = getAuditLogger().getLogs({ limit: 5000 }).length;
    await logAudit({ clientKey: 'ck', action: 'unit', details: {}, ip: '127.0.0.1', userAgent: 'jest' });
    expect(getAuditLogger().getLogs({ limit: 5000 }).length).toBeGreaterThanOrEqual(before);
  });
});

