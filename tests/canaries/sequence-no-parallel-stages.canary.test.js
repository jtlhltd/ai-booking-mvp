/**
 * Canary for Intent Contract: sequence.no-parallel-stages-per-lead
 * intent: sequence.no-parallel-stages-per-lead
 * intent: sequence.stale-active-sequence
 */
import { describe, expect, test, jest, beforeEach } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
});

describe('canary: sequence.no-parallel-stages-per-lead', () => {
  test('second vapi_call enqueue for same tenant+phone reuses row id (no parallel pending rows)', async () => {
    const { createCallQueueDomain } = await import('../../db/domains/call-queue.js');
    const existingId = 42;
    const firstSlot = new Date(Date.now() + 3_600_000);
    const secondSlot = new Date(Date.now() + 7_200_000);
    let insertCount = 0;

    const query = jest.fn(async (sql) => {
      const s = String(sql);
      if (s.includes('opt_out_list')) return { rows: [] };
      if (s.includes('FROM call_queue') && s.includes('LIMIT 1')) {
        return { rows: [{ id: existingId, scheduled_for: firstSlot.toISOString(), priority: 5 }] };
      }
      if (s.trimStart().startsWith('UPDATE call_queue')) {
        return { rows: [] };
      }
      if (s.includes('INSERT INTO call_queue')) {
        insertCount += 1;
        return { rows: [{ id: 999 }] };
      }
      if (s.includes('SELECT * FROM call_queue WHERE id')) {
        return { rows: [{ id: existingId, client_key: 'ck', lead_phone: '+441112223344' }] };
      }
      return { rows: [] };
    });

    const domain = createCallQueueDomain({
      getDbType: () => 'postgres',
      getPool: () => ({}),
      getSqlite: () => null,
      query,
      phoneMatchKey: (p) => String(p || '').replace(/\s/g, ''),
      outboundDialClaimKeyFromRaw: (p) => String(p || '').replace(/\s/g, ''),
      smearCallQueueScheduledFor: (d) => d,
      pgQueueLeadPhoneKeyExpr: () => 'lead_phone',
      callQueueReads: { getPendingCalls: jest.fn() },
      callQueueWrites: { updateCallQueueStatus: jest.fn() }
    });

    const out = await domain.addToCallQueue({
      clientKey: 'ck',
      leadPhone: '+441112223344',
      priority: 5,
      scheduledFor: secondSlot,
      callType: 'vapi_call',
      callData: { stageId: 'stage2_discovery', triggerType: 'sequence_next' }
    });

    expect(out.id).toBe(existingId);
    expect(insertCount).toBe(0);
  });
});
