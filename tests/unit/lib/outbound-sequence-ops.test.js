import { describe, expect, test, jest } from '@jest/globals';

import {
  appendSequenceOpsAudit,
  dismissSequenceSalvageForLead,
  markSequenceSalvageDismissed,
  stopOutboundSequenceForLead,
} from '../../../lib/outbound-sequence-ops.js';

describe('lib/outbound-sequence-ops', () => {
  test('appendSequenceOpsAudit caps entries at 32', () => {
    let data = {};
    for (let idx = 0; idx < 35; idx += 1) {
      data = appendSequenceOpsAudit(data, {
        actor: 'operator',
        action: `a_${idx}`,
        at: `2026-05-12T10:${String(idx).padStart(2, '0')}:00.000Z`,
      });
    }
    expect(Array.isArray(data.qual._opsAudit)).toBe(true);
    expect(data.qual._opsAudit).toHaveLength(32);
    expect(data.qual._opsAudit[0].action).toBe('a_3');
    expect(data.qual._opsAudit[31].action).toBe('a_34');
  });

  test('markSequenceSalvageDismissed stamps dismissal fields and audit', () => {
    const out = markSequenceSalvageDismissed({}, {
      actor: 'ops-user',
      at: '2026-05-12T10:20:00.000Z',
    });
    expect(out.qual._salvageDismissedAt).toBe('2026-05-12T10:20:00.000Z');
    expect(out.qual._salvageDismissedBy).toBe('ops-user');
    expect(out.qual._opsAudit).toEqual([
      {
        at: '2026-05-12T10:20:00.000Z',
        actor: 'ops-user',
        action: 'salvage_dismiss',
      },
    ]);
  });

  test('stopOutboundSequenceForLead cancels only sequence_next rows and writes audit handoff', async () => {
    const updateCallQueueStatus = jest.fn(async () => {});
    const updateLeadSequenceState = jest.fn(async () => ({ ok: true }));
    const upsertLeadHandoff = jest.fn(async () => {});
    const result = await stopOutboundSequenceForLead({
      clientKey: 'c1',
      leadPhone: '+447700900111',
      actor: 'ops-user',
      getLeadSequenceState: jest.fn(async () => ({ status: 'active' })),
      updateLeadSequenceState,
      getCallQueueByPhone: jest.fn(async () => [
        { id: 1, status: 'pending', call_type: 'vapi_call', call_data: { triggerType: 'sequence_next' } },
        { id: 2, status: 'pending', call_type: 'vapi_call', call_data: { triggerType: 'follow_up_retry' } },
      ]),
      updateCallQueueStatus,
      getLeadHandoffByPhone: jest.fn(async () => null),
      upsertLeadHandoff,
    });

    expect(result).toEqual(expect.objectContaining({
      ok: true,
      status: 'abandoned',
      cancelledQueueRows: 1,
    }));
    expect(updateCallQueueStatus).toHaveBeenCalledTimes(1);
    expect(updateCallQueueStatus).toHaveBeenCalledWith(1, 'cancelled');
    expect(updateLeadSequenceState).toHaveBeenCalledWith('c1', '+447700900111', expect.objectContaining({
      status: 'abandoned',
      nextStageScheduledFor: null,
    }));
    expect(upsertLeadHandoff).toHaveBeenCalledWith(expect.objectContaining({
      clientKey: 'c1',
      leadPhone: '+447700900111',
      source: 'operator.sequence_stopped',
      data: expect.objectContaining({
        qual: expect.objectContaining({
          _opsAudit: expect.arrayContaining([
            expect.objectContaining({ actor: 'ops-user', action: 'sequence_stop' }),
          ]),
        }),
      }),
    }));
  });

  test('dismissSequenceSalvageForLead rejects non-abandoned handoff and stamps dismissal when valid', async () => {
    const upsertLeadHandoff = jest.fn(async () => {});
    const bad = await dismissSequenceSalvageForLead({
      clientKey: 'c1',
      leadPhone: '+447700900111',
      getLeadHandoffByPhone: jest.fn(async () => ({ source: 'vapi_webhook.sequence_completed' })),
      upsertLeadHandoff,
    });
    expect(bad).toEqual({ ok: false, error: 'handoff_not_abandoned_salvage' });

    const good = await dismissSequenceSalvageForLead({
      clientKey: 'c1',
      leadPhone: '+447700900111',
      actor: 'ops-user',
      getLeadHandoffByPhone: jest.fn(async () => ({
        leadPhone: '+447700900111',
        source: 'vapi_webhook.sequence_abandoned',
        summaryText: 'Needs human salvage',
        dataJson: '{}',
      })),
      upsertLeadHandoff,
    });
    expect(good).toEqual(expect.objectContaining({ ok: true, source: 'vapi_webhook.sequence_abandoned' }));
    expect(upsertLeadHandoff).toHaveBeenCalledWith(expect.objectContaining({
      source: 'vapi_webhook.sequence_abandoned',
      data: expect.objectContaining({
        qual: expect.objectContaining({
          _salvageDismissedBy: 'ops-user',
          _opsAudit: expect.arrayContaining([
            expect.objectContaining({ action: 'salvage_dismiss' }),
          ]),
        }),
      }),
    }));
  });
});
