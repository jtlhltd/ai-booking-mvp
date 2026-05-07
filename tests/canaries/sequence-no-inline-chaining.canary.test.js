/**
 * Canary for Intent Contract: sequence.no-inline-stage-chaining
 * intent: sequence.respects-business-hours
 */
import { describe, expect, test, jest, beforeEach, afterEach } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-05-07T14:00:00.000Z'));
});

afterEach(() => {
  jest.useRealTimers();
});

describe('canary: sequence.no-inline-stage-chaining', () => {
  test('next stage enqueue uses scheduled_for strictly in the future', async () => {
    const addToCallQueue = jest.fn(async () => {});
    const updateLeadSequenceState = jest.fn(async () => {});
    const upsertLeadHandoff = jest.fn(async () => {});

    jest.unstable_mockModule('../../db.js', () => ({
      getFullClient: jest.fn(async () => ({
        clientKey: 'tenant-seq',
        displayName: 'Seq Tenant',
        timezone: 'Europe/London',
        booking: { timezone: 'Europe/London' },
        outboundSequence: {
          enabled: true,
          maxTotalDialsPerLead: 7,
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
        attemptsTotal: 0,
        startedAt: new Date().toISOString(),
        status: 'active'
      })),
      updateLeadSequenceState,
      addToCallQueue,
      upsertLeadHandoff,
      getLatestCallInsights: jest.fn(async () => ({ routing: null }))
    }));

    jest.unstable_mockModule('../../lib/optimal-call-window.js', () => ({
      scheduleAtOptimalCallWindow: jest.fn(async (_tenant, _routing, baseline) => {
        const b = baseline instanceof Date ? baseline : new Date(baseline);
        return new Date(b.getTime());
      })
    }));

    const { handleOutboundSequenceEndOfCall } = await import(
      '../../lib/vapi-webhooks/outbound-sequence-webhook.js'
    );

    await handleOutboundSequenceEndOfCall({
      tenantKey: 'tenant-seq',
      leadPhone: '+447700900001',
      metadata: { stageId: 's1', leadId: 1 },
      correlationId: 'c1',
      callId: 'call-1',
      outcome: 'completed',
      noUsefulOutcome: false,
      structuredSources: [{ decisionMakerName: 'Pat' }]
    });

    expect(addToCallQueue).toHaveBeenCalledTimes(1);
    const arg = addToCallQueue.mock.calls[0][0];
    expect(arg.scheduledFor.getTime()).toBeGreaterThan(Date.now());
  });
});
