/**
 * Canary for Intent Contract: sequence.operator-stop-dismiss-audited
 */
import { describe, expect, jest, test } from '@jest/globals';

import {
  dismissSequenceSalvageForLead,
  stopOutboundSequenceForLead,
} from '../../lib/outbound-sequence-ops.js';
import { getDashboardCohortMeta, matchesDashboardCohort } from '../../lib/dashboard-follow-up-filters.js';

describe('canary: sequence.operator-stop-dismiss-audited', () => {
  test('stop cancels future sequence_next rows and appends ops audit', async () => {
    const updateCallQueueStatus = jest.fn(async () => {});
    const updateLeadSequenceState = jest.fn(async () => ({ ok: true }));
    const upsertLeadHandoff = jest.fn(async () => {});

    const out = await stopOutboundSequenceForLead({
      clientKey: 'tenant-seq',
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

    expect(out.ok).toBe(true);
    expect(out.cancelledQueueRows).toBe(1);
    expect(updateCallQueueStatus).toHaveBeenCalledTimes(1);
    expect(updateLeadSequenceState).toHaveBeenCalledWith(
      'tenant-seq',
      '+447700900111',
      expect.objectContaining({ status: 'abandoned', nextStageScheduledFor: null })
    );
    expect(upsertLeadHandoff).toHaveBeenCalledWith(expect.objectContaining({
      source: 'operator.sequence_stopped',
      data: expect.objectContaining({
        qual: expect.objectContaining({
          _opsAudit: expect.arrayContaining([
            expect.objectContaining({ actor: 'ops-user', action: 'sequence_stop' }),
          ]),
        }),
      }),
    }));
    const handoff = upsertLeadHandoff.mock.calls[0][0];
    const meta = getDashboardCohortMeta({
      handoffSource: handoff.source,
      hasSequenceState: true,
      leadCreatedAt: '2026-05-12T09:00:00.000Z',
      tenantTimezone: 'Europe/London',
    });
    expect(matchesDashboardCohort(meta, 'stopped')).toBe(true);
    expect(matchesDashboardCohort(meta, 'abandoned')).toBe(false);
  });

  test('dismissed salvage leaves abandoned cohort but remains in all', async () => {
    const upsertLeadHandoff = jest.fn(async () => {});
    const out = await dismissSequenceSalvageForLead({
      clientKey: 'tenant-seq',
      leadPhone: '+447700900222',
      actor: 'ops-user',
      getLeadHandoffByPhone: jest.fn(async () => ({
        leadPhone: '+447700900222',
        source: 'vapi_webhook.sequence_abandoned',
        summaryText: 'Needs salvage',
        dataJson: '{}',
      })),
      upsertLeadHandoff,
    });

    expect(out.ok).toBe(true);
    const handoff = upsertLeadHandoff.mock.calls[0][0];
    const dismissedAt = handoff.data.qual._salvageDismissedAt;
    const meta = getDashboardCohortMeta({
      handoffSource: 'vapi_webhook.sequence_abandoned',
      salvageDismissedAt: dismissedAt,
      hasSequenceState: true,
      leadCreatedAt: '2026-05-12T09:00:00.000Z',
      tenantTimezone: 'Europe/London',
    });
    expect(matchesDashboardCohort(meta, 'abandoned')).toBe(false);
    expect(matchesDashboardCohort(meta, 'all')).toBe(true);
    expect(handoff.data.qual._opsAudit).toEqual(
      expect.arrayContaining([expect.objectContaining({ actor: 'ops-user', action: 'salvage_dismiss' })])
    );
  });
});
