import { describe, expect, jest, test } from '@jest/globals';
import { stopLeadsOutboundSequenceBulk } from '../../../lib/outbound-sequence-ops.js';

describe('stopLeadsOutboundSequenceBulk', () => {
  test('stops each phone and reports partial failures', async () => {
    const getLeadSequenceState = jest.fn(async (_clientKey, phone) => {
      if (phone === '+447700900222') return null;
      return { status: 'active', currentStageId: 's1' };
    });
    const updateLeadSequenceState = jest.fn(async () => ({}));
    const getCallQueueByPhone = jest.fn(async () => []);
    const upsertLeadHandoff = jest.fn(async () => ({}));

    const out = await stopLeadsOutboundSequenceBulk({
      clientKey: 'c1',
      leadPhones: ['+447700900111', '+447700900222', '+447700900111'],
      actor: 'operator',
      getLeadSequenceState,
      updateLeadSequenceState,
      getCallQueueByPhone,
      updateCallQueueStatus: jest.fn(),
      getLeadHandoffByPhone: jest.fn(async () => null),
      upsertLeadHandoff,
    });

    expect(out.ok).toBe(true);
    expect(out.partial).toBe(true);
    expect(out.requested).toBe(2);
    expect(out.updated).toBe(1);
    expect(out.failed).toBe(1);
    expect(out.results).toHaveLength(2);
    expect(updateLeadSequenceState).toHaveBeenCalledTimes(1);
  });

  test('rejects empty phone list', async () => {
    const out = await stopLeadsOutboundSequenceBulk({
      clientKey: 'c1',
      leadPhones: [],
      getLeadSequenceState: jest.fn(),
      updateLeadSequenceState: jest.fn(),
      getCallQueueByPhone: jest.fn(),
      updateCallQueueStatus: jest.fn(),
      getLeadHandoffByPhone: jest.fn(),
      upsertLeadHandoff: jest.fn(),
    });
    expect(out).toEqual({ ok: false, error: 'no_lead_phones' });
  });
});
