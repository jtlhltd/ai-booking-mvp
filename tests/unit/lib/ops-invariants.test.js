import { describe, test, expect, jest, beforeEach } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
  delete process.env.OPS_INVARIANTS_CLIENT_KEY;
  delete process.env.OPS_INVARIANTS_ALL_CLIENTS;
  delete process.env.YOUR_EMAIL;
});

describe('lib/ops-invariants', () => {
  test('checkOpsInvariants returns skipped when no client configured', async () => {
    jest.unstable_mockModule('../../../db.js', () => ({ query: jest.fn(async () => ({ rows: [] })) }));
    jest.unstable_mockModule('../../../lib/messaging-service.js', () => ({ default: { sendEmail: jest.fn(async () => {}) } }));

    const { checkOpsInvariants } = await import('../../../lib/ops-invariants.js');
    const out = await checkOpsInvariants();
    expect(out).toEqual(expect.objectContaining({ ok: true, skipped: true }));
  });

  test('checkOpsInvariants runs single-client checks and reports ok', async () => {
    const query = jest.fn(async (sql) => {
      const s = String(sql);
      if (s.includes('phantom')) return { rows: [{ n: 0 }] };
      if (s.includes('stuck')) return { rows: [{ n: 0 }] };
      if (s.includes('max_per_exact_hour')) return { rows: [{ max_per_exact_hour: 0 }] };
      if (s.includes('FROM retry_queue')) return { rows: [{ n: 0 }] };
      return { rows: [{ n: 0 }] };
    });

    jest.unstable_mockModule('../../../db.js', () => ({ query }));
    jest.unstable_mockModule('../../../lib/messaging-service.js', () => ({ default: { sendEmail: jest.fn(async () => {}) } }));

    const { checkOpsInvariants } = await import('../../../lib/ops-invariants.js');
    const out = await checkOpsInvariants({ clientKey: 'c1' });
    expect(out.ok).toBe(true);
    expect(out.checked).toBe(1);
  });
});

