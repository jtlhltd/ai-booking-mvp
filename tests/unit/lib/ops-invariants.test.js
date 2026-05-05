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
      if (s.includes('max_per_lead')) return { rows: [{ max_per_lead: 0 }] };
      if (s.includes('scheduled_for < created_at')) return { rows: [{ n: 0 }] };
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
        maxImportPerInstant: 0,
        maxRetriesForAnyLead: 0,
        pastScheduledForN: 0
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
      if (s.includes('max_per_lead')) return { rows: [{ max_per_lead: 0 }] };
      if (s.includes('scheduled_for < created_at')) return { rows: [{ n: 0 }] };
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

  test('checkOpsInvariants flags retry_loop_per_lead when one lead exceeds MAX_RETRIES_PER_LEAD', async () => {
    process.env.MAX_RETRIES_PER_LEAD = '3';
    const query = jest.fn(async (sql) => {
      const s = String(sql);
      if (s.includes('phantom')) return { rows: [{ n: 0 }] };
      if (s.includes('stuck')) return { rows: [{ n: 0 }] };
      if (s.includes('max_per_exact_hour')) return { rows: [{ max_per_exact_hour: 0 }] };
      if (s.includes('FROM retry_queue')) return { rows: [{ n: 0 }] };
      if (s.includes('max_per_minute')) return { rows: [{ max_per_minute: 0 }] };
      if (s.includes('max_per_instant')) return { rows: [{ max_per_instant: 0 }] };
      if (s.includes('max_per_lead')) return { rows: [{ max_per_lead: 7 }] };
      if (s.includes('scheduled_for < created_at')) return { rows: [{ n: 0 }] };
      return { rows: [{ n: 0 }] };
    });

    jest.unstable_mockModule('../../../db.js', () => ({ query }));
    jest.unstable_mockModule('../../../lib/messaging-service.js', () => ({ default: { sendEmail: jest.fn(async () => {}) } }));

    const { checkOpsInvariants } = await import('../../../lib/ops-invariants.js');
    const out = await checkOpsInvariants({ clientKey: 'c1' });
    expect(out.ok).toBe(false);
    const hit = out.results[0].problems.find((p) => p.key === 'retry_loop_per_lead');
    expect(hit).toBeDefined();
    expect(hit.intentId).toBe('billing.max-retries-bounded');
    expect(hit.value).toBe(7);
    expect(hit.threshold).toBe(3);

    delete process.env.MAX_RETRIES_PER_LEAD;
  });

  test('checkOpsInvariants flags past_scheduled_for when scheduled_for predates created_at', async () => {
    const query = jest.fn(async (sql) => {
      const s = String(sql);
      if (s.includes('phantom')) return { rows: [{ n: 0 }] };
      if (s.includes('stuck')) return { rows: [{ n: 0 }] };
      if (s.includes('max_per_exact_hour')) return { rows: [{ max_per_exact_hour: 0 }] };
      if (s.includes('FROM retry_queue')) return { rows: [{ n: 0 }] };
      if (s.includes('max_per_minute')) return { rows: [{ max_per_minute: 0 }] };
      if (s.includes('max_per_instant')) return { rows: [{ max_per_instant: 0 }] };
      if (s.includes('max_per_lead')) return { rows: [{ max_per_lead: 0 }] };
      if (s.includes('scheduled_for < created_at')) return { rows: [{ n: 4 }] };
      return { rows: [{ n: 0 }] };
    });

    jest.unstable_mockModule('../../../db.js', () => ({ query }));
    jest.unstable_mockModule('../../../lib/messaging-service.js', () => ({ default: { sendEmail: jest.fn(async () => {}) } }));

    const { checkOpsInvariants } = await import('../../../lib/ops-invariants.js');
    const out = await checkOpsInvariants({ clientKey: 'c1' });
    expect(out.ok).toBe(false);
    const hit = out.results[0].problems.find((p) => p.key === 'past_scheduled_for');
    expect(hit).toBeDefined();
    expect(hit.intentId).toBe('scheduling.no-past-scheduled-for');
    expect(hit.value).toBe(4);
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
        'dial.imports-distribute-not-burst',
        'billing.max-retries-bounded',
        'scheduling.no-past-scheduled-for'
      ])
    );

    const violatedSummary = summarizeOpsInvariants({
      results: [
        {
          clientKey: 'c1',
          problems: [
            { key: 'dial_burst_detected', value: 50, threshold: 15 },
            { key: 'import_burst_unspaced', value: 8 },
            { key: 'retry_loop_per_lead', value: 9, threshold: 3 },
            { key: 'past_scheduled_for', value: 2 }
          ]
        }
      ]
    });
    expect(violatedSummary.ok).toBe(false);
    const burstItem = violatedSummary.items.find((i) => i.intentId === 'billing.no-burst-dial');
    expect(burstItem.status).toBe('violated');
    expect(burstItem.detail).toContain('c1');
    expect(burstItem.detail).toContain('50');

    const retryLoopItem = violatedSummary.items.find((i) => i.intentId === 'billing.max-retries-bounded');
    expect(retryLoopItem.status).toBe('violated');
    expect(retryLoopItem.detail).toContain('9/3');

    const pastSchedItem = violatedSummary.items.find((i) => i.intentId === 'scheduling.no-past-scheduled-for');
    expect(pastSchedItem.status).toBe('violated');
    expect(pastSchedItem.detail).toContain('c1=2');
  });
});

