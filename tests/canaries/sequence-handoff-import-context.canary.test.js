/**
 * Canary for Intent Contract: sequence.handoff-import-context-allowlist
 */
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
});

function makeLeadDialContext() {
  return {
    crmCampaign: 'campaign-7',
    laneHint: 'Manchester-Rotterdam pallets',
    shipperCompanyName: 'Acme Logistics',
    leadName: 'Reserved Name',
    nested: { should: 'drop' }
  };
}

function makeBaseClient(overrides = {}) {
  return {
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
          isFinal: true,
          scheduling: {}
        }
      ],
      ...overrides
    },
    vapi: {}
  };
}

describe('canary: sequence.handoff-import-context-allowlist', () => {
  test('completed handoff uses default import-context keys only', async () => {
    const updateLeadSequenceState = jest.fn(async () => {});
    const upsertLeadHandoff = jest.fn(async () => {});
    const query = jest.fn(async () => ({
      rows: [{ leadDialContextJson: makeLeadDialContext() }]
    }));

    jest.unstable_mockModule('../../db.js', () => ({
      getFullClient: jest.fn(async () => makeBaseClient()),
      getLeadSequenceState: jest.fn(async () => ({
        currentStageId: 's1',
        stagesCompleted: [],
        attemptsInStage: 0,
        attemptsTotal: 0,
        startedAt: new Date().toISOString(),
        status: 'active'
      })),
      updateLeadSequenceState,
      addToCallQueue: jest.fn(async () => {}),
      upsertLeadHandoff,
      getLatestCallInsights: jest.fn(async () => ({ routing: null })),
      query
    }));

    const { handleOutboundSequenceEndOfCall } = await import(
      '../../lib/vapi-webhooks/outbound-sequence-webhook.js'
    );

    await handleOutboundSequenceEndOfCall({
      tenantKey: 'tenant-seq',
      leadPhone: '+447700900003',
      metadata: { stageId: 's1' },
      correlationId: 'c-seq-import-complete',
      callId: 'call-complete',
      outcome: 'completed',
      noUsefulOutcome: false,
      structuredSources: [{ decisionMakerName: 'Pat', transcriptSnippet: 'Ready for follow-up' }]
    });

    expect(updateLeadSequenceState).toHaveBeenCalled();
    expect(upsertLeadHandoff).toHaveBeenCalledWith(expect.objectContaining({
      source: 'vapi_webhook.sequence_completed'
    }));
    const handoff = upsertLeadHandoff.mock.calls[0][0];
    expect(handoff.data.qual._importContext).toEqual({
      crmCampaign: 'campaign-7',
      laneHint: 'Manchester-Rotterdam pallets'
    });
    expect(handoff.data.qual._importContext.shipperCompanyName).toBeUndefined();
    expect(handoff.data.qual._importContext.leadName).toBeUndefined();
    expect(handoff.data.qual._importContext.nested).toBeUndefined();
    expect(query).toHaveBeenCalledTimes(1);
  });

  test('abandoned handoff honors tenant override list instead of defaults', async () => {
    const upsertLeadHandoff = jest.fn(async () => {});

    jest.unstable_mockModule('../../db.js', () => ({
      getFullClient: jest.fn(async () =>
        makeBaseClient({
          maxTotalDialsPerLead: 1,
          handoffImportContextKeys: ['shipperCompanyName', 'crmCampaign']
        })
      ),
      getLeadSequenceState: jest.fn(async () => ({
        currentStageId: 's1',
        stagesCompleted: [],
        attemptsInStage: 0,
        attemptsTotal: 1,
        startedAt: new Date().toISOString(),
        status: 'active'
      })),
      updateLeadSequenceState: jest.fn(async () => {}),
      addToCallQueue: jest.fn(async () => {}),
      upsertLeadHandoff,
      getLatestCallInsights: jest.fn(async () => ({ routing: null })),
      query: jest.fn(async () => ({
        rows: [{ leadDialContextJson: makeLeadDialContext() }]
      }))
    }));

    const { handleOutboundSequenceEndOfCall } = await import(
      '../../lib/vapi-webhooks/outbound-sequence-webhook.js'
    );

    await handleOutboundSequenceEndOfCall({
      tenantKey: 'tenant-seq',
      leadPhone: '+447700900004',
      metadata: { stageId: 's1' },
      correlationId: 'c-seq-import-abandon',
      callId: 'call-abandon',
      outcome: 'completed',
      noUsefulOutcome: false,
      structuredSources: [{ decisionMakerName: 'Sam' }]
    });

    expect(upsertLeadHandoff).toHaveBeenCalledWith(expect.objectContaining({
      source: 'vapi_webhook.sequence_abandoned'
    }));
    const handoff = upsertLeadHandoff.mock.calls[0][0];
    expect(handoff.data.qual._importContext).toEqual({
      shipperCompanyName: 'Acme Logistics',
      crmCampaign: 'campaign-7'
    });
    expect(handoff.data.qual._importContext.laneHint).toBeUndefined();
  });
});
