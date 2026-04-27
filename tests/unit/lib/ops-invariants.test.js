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
      if (s.includes('max_per_minute')) return { rows: [{ max_per_minute: 0 }] };
      if (s.includes('max_per_instant')) return { rows: [{ max_per_instant: 0 }] };
      return { rows: [{ n: 0 }] };
    });

    jest.unstable_mockModule('../../../db.js', () => ({ query }));
    jest.unstable_mockModule('../../../lib/messaging-service.js', () => ({ default: { sendEmail: jest.fn(async () => {}) } }));

    const { checkOpsInvariants } = await import('../../../lib/ops-invariants.js');
    const out = await checkOpsInvariants({ clientKey: 'c1' });
    expect(out.ok).toBe(true);
    expect(out.checked).toBe(1);
    expect(out.results[0]).toEqual(
      expect.objectContaining({
        maxDialPerMinute: 0,
        maxImportPerInstant: 0
      })
    );
  });

  test('checkOpsInvariants flags dial_burst_detected and import_burst_unspaced', async () => {
    const query = jest.fn(async (sql) => {
      const s = String(sql);
      if (s.includes('phantom')) return { rows: [{ n: 0 }] };
      if (s.includes('stuck')) return { rows: [{ n: 0 }] };
      if (s.includes('max_per_exact_hour')) return { rows: [{ max_per_exact_hour: 0 }] };
      if (s.includes('FROM retry_queue')) return { rows: [{ n: 0 }] };
      if (s.includes('max_per_minute')) return { rows: [{ max_per_minute: 50 }] };
      if (s.includes('max_per_instant')) return { rows: [{ max_per_instant: 8 }] };
      return { rows: [{ n: 0 }] };
    });

    jest.unstable_mockModule('../../../db.js', () => ({ query }));
    jest.unstable_mockModule('../../../lib/messaging-service.js', () => ({ default: { sendEmail: jest.fn(async () => {}) } }));

    const { checkOpsInvariants } = await import('../../../lib/ops-invariants.js');
    const out = await checkOpsInvariants({ clientKey: 'c1' });
    expect(out.ok).toBe(false);
    const keys = out.results[0].problems.map((p) => p.key);
    expect(keys).toEqual(expect.arrayContaining(['dial_burst_detected', 'import_burst_unspaced']));
  });

  test('summarizeOpsInvariants renders a non-coder readable checklist', async () => {
    jest.unstable_mockModule('../../../db.js', () => ({ query: jest.fn(async () => ({ rows: [] })) }));
    jest.unstable_mockModule('../../../lib/messaging-service.js', () => ({ default: { sendEmail: jest.fn(async () => {}) } }));

    const { summarizeOpsInvariants } = await import('../../../lib/ops-invariants.js');

    const okSummary = summarizeOpsInvariants({
      results: [{ clientKey: 'c1', problems: [] }]
    });
    expect(okSummary.ok).toBe(true);
    expect(okSummary.items.every((i) => i.status === 'ok')).toBe(true);
    expect(okSummary.items.map((i) => i.intentId)).toEqual(
      expect.arrayContaining([
        'queue.no-phantom-completed',
        'queue.no-stuck-processing',
        'queue.no-top-of-hour-clump',
        'queue.retry-backlog-bounded',
        'billing.no-burst-dial',
        'dial.imports-distribute-not-burst'
      ])
    );

    const violatedSummary = summarizeOpsInvariants({
      results: [
        {
          clientKey: 'c1',
          problems: [
            { key: 'dial_burst_detected', value: 50, threshold: 15 },
            { key: 'import_burst_unspaced', value: 8 }
          ]
        }
      ]
    });
    expect(violatedSummary.ok).toBe(false);
    const burstItem = violatedSummary.items.find((i) => i.intentId === 'billing.no-burst-dial');
    expect(burstItem.status).toBe('violated');
    expect(burstItem.detail).toContain('c1');
    expect(burstItem.detail).toContain('50');
  });
});

