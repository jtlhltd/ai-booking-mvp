import { describe, test, expect, jest, beforeEach } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
  delete process.env.GOOGLE_CLIENT_EMAIL;
});

describe('lib/health-monitor', () => {
  test('getComprehensiveHealth returns services + metrics', async () => {
    jest.unstable_mockModule('../../../db.js', () => ({
      query: jest.fn(async (sql) => {
        const s = String(sql);
        if (s.includes('COUNT(*)') && s.includes('appointments')) return { rows: [{ count: 1 }] };
        if (s.includes('COUNT(*)') && s.includes('leads')) return { rows: [{ count: 2 }] };
        if (s.includes('COUNT(*)') && s.includes('calls')) return { rows: [{ count: 3 }] };
        if (s.includes('COUNT(*)') && s.includes('messages')) return { rows: [{ count: 4 }] };
        return { rows: [] };
      }),
    }));
    jest.unstable_mockModule('../../../lib/connection-pool-monitor.js', () => ({ getPoolStatus: jest.fn(async () => ({ ok: true })) }));
    jest.unstable_mockModule('../../../lib/circuit-breaker.js', () => ({ getCircuitBreakerStatus: jest.fn(() => ({ a: { state: 'closed' } })) }));
    jest.unstable_mockModule('../../../lib/request-queue.js', () => ({ getQueueStatus: jest.fn(async () => ({ byStatus: { pending: { count: 0 } } })) }));
    jest.unstable_mockModule('../../../lib/timeouts.js', () => ({
      TIMEOUTS: { vapi: 1, twilio: 1 },
      fetchWithTimeout: jest.fn(async () => ({ ok: true, status: 200 })),
    }));
    jest.unstable_mockModule('../../../lib/backup-monitoring.js', () => ({
      verifyBackupSystem: jest.fn(async () => ({ status: 'healthy', message: 'ok', backupAge: 1, databaseAccessible: true, recentActivity: [], hasActiveClients: false })),
    }));

    const { getComprehensiveHealth } = await import('../../../lib/health-monitor.js');
    const out = await getComprehensiveHealth('c1');
    expect(out).toEqual(expect.objectContaining({ status: expect.any(String), services: expect.any(Object), metrics: expect.any(Object) }));
    expect(out.metrics.last24Hours).toEqual(expect.objectContaining({ appointments: 1, leads: 2, calls: 3, messages: 4 }));
  });
});

