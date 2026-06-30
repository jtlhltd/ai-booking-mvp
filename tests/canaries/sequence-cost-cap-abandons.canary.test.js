/**
 * Canary for Intent Contract: sequence.bounded-total-dials-per-lead
 */
import { describe, expect, test, jest, beforeEach } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
});

describe('canary: sequence.bounded-total-dials-per-lead', () => {
  test('when next dial would exceed maxTotalDialsPerLead, handler abandons without enqueue', async () => {
    const addToCallQueue = jest.fn(async () => {});
    const updateLeadSequenceState = jest.fn(async () => {});
    const upsertLeadHandoff = jest.fn(async () => {});

    jest.unstable_mockModule('../../db.js', () => ({
      getFullClient: jest.fn(async () => ({
        clientKey: 'tenant-cap',
        displayName: 'Cap Tenant',
        timezone: 'Europe/London',
        booking: { timezone: 'Europe/London' },
        outboundSequence: {
          enabled: true,
          maxTotalDialsPerLead: 2,
          maxSequenceDurationDays: 14,
          stages: [
            {
              id: 's1',
              firstMessage: 'Hi',
              systemMessage: 'S1',
              requiredFields: ['decisionMakerName'],
              maxAttemptsInStage: 3,
              nextStage: 's2',
              scheduling: { minDelayMinutesBeforeNext: 60, maxDelayMinutesBeforeNext: 120 }
            },
            {
              id: 's2',
              firstMessage: 'H2',
              systemMessage: 'S2',
              requiredFields: ['originCity'],
              maxAttemptsInStage: 3,
              isFinal: true,
              scheduling: {}
            }
          ]
        },
        vapi: {}
      })),
      getLeadSequenceState: jest.fn(async () => ({
        currentStageId: 's1',
        stagesCompleted: [],
        attemptsInStage: 0,
        attemptsTotal: 2,
        startedAt: new Date().toISOString(),
        status: 'active'
      })),
      updateLeadSequenceState,
      addToCallQueue,
      upsertLeadHandoff,
      getLatestCallInsights: jest.fn(async () => ({ routing: null })),
      query: jest.fn(async () => ({ rows: [] }))
    }));

    jest.unstable_mockModule('../../lib/optimal-call-window.js', () => ({
      scheduleAtOptimalCallWindow: jest.fn(async (_t, _r, baseline) =>
        baseline instanceof Date ? baseline : new Date(baseline)
      )
    }));

    const { handleOutboundSequenceEndOfCall } = await import(
      '../../lib/vapi-webhooks/outbound-sequence-webhook.js'
    );

    await handleOutboundSequenceEndOfCall({
      tenantKey: 'tenant-cap',
      leadPhone: '+447700900002',
      metadata: { stageId: 's1' },
      correlationId: 'c2',
      callId: 'call-2',
      outcome: 'completed',
      noUsefulOutcome: false,
      structuredSources: [{ decisionMakerName: 'Sam' }]
    });

    expect(addToCallQueue).not.toHaveBeenCalled();
    expect(upsertLeadHandoff).toHaveBeenCalled();
    const u = updateLeadSequenceState.mock.calls[0]?.[2];
    expect(u?.status).toBe('abandoned');
  });
});
