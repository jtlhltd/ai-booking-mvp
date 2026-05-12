import { describe, expect, test, beforeEach, afterEach, jest } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
  delete process.env.OUTBOUND_SEQUENCE_DISABLED;
});

afterEach(() => {
  delete process.env.OUTBOUND_SEQUENCE_DISABLED;
});

const VALID_CFG = {
  enabled: true,
  maxTotalDialsPerLead: 7,
  maxSequenceDurationDays: 14,
  stages: [
    {
      id: 's1',
      firstMessage: 'Hi {decisionMakerName}',
      systemMessage: 'sys-1',
      requiredFields: ['decisionMakerName'],
      maxAttemptsInStage: 3,
      nextStage: 's2',
      maxDurationSeconds: 120,
      scheduling: { minDelayMinutesBeforeNext: 60, maxDelayMinutesBeforeNext: 120 }
    },
    {
      id: 's2',
      firstMessage: 'Hi2',
      systemMessage: 'sys-2',
      requiredFields: ['originCity'],
      maxAttemptsInStage: 3,
      isFinal: true,
      scheduling: {}
    }
  ]
};

describe('lib/outbound-sequence', () => {
  test('validateOutboundSequenceConfig accepts a Tom-shaped config', async () => {
    const { validateOutboundSequenceConfig } = await import('../../../lib/outbound-sequence.js');
    const out = validateOutboundSequenceConfig(VALID_CFG);
    expect(out.ok).toBe(true);
  });

  test('validateOutboundSequenceConfig accepts optional handoff/root keys', async () => {
    const { validateOutboundSequenceConfig } = await import('../../../lib/outbound-sequence.js');
    const out = validateOutboundSequenceConfig({
      ...VALID_CFG,
      handoffImportContextKeys: ['crmCampaign', 'laneHint', 'shipperCompanyName'],
      classicFollowUpCutoverDate: '2026-05-12'
    });
    expect(out.ok).toBe(true);
  });

  test('validateOutboundSequenceConfig rejects missing requiredFields', async () => {
    const { validateOutboundSequenceConfig } = await import('../../../lib/outbound-sequence.js');
    const bad = validateOutboundSequenceConfig({
      ...VALID_CFG,
      stages: [{ id: 's1', firstMessage: 'a', systemMessage: 'b', requiredFields: [], maxAttemptsInStage: 1, isFinal: true, scheduling: {} }]
    });
    expect(bad.ok).toBe(false);
  });

  test('validateOutboundSequenceConfig rejects unknown nextStage', async () => {
    const { validateOutboundSequenceConfig } = await import('../../../lib/outbound-sequence.js');
    const bad = validateOutboundSequenceConfig({
      ...VALID_CFG,
      stages: [
        { ...VALID_CFG.stages[0], nextStage: 'does_not_exist' },
        VALID_CFG.stages[1]
      ]
    });
    expect(bad.ok).toBe(false);
  });

  test('validateOutboundSequenceConfig rejects last stage without isFinal', async () => {
    const { validateOutboundSequenceConfig } = await import('../../../lib/outbound-sequence.js');
    const bad = validateOutboundSequenceConfig({
      ...VALID_CFG,
      stages: [
        VALID_CFG.stages[0],
        { ...VALID_CFG.stages[1], isFinal: false, nextStage: 's3' }
      ]
    });
    expect(bad.ok).toBe(false);
  });

  test('validateOutboundSequenceConfig rejects malformed handoff/root keys', async () => {
    const { validateOutboundSequenceConfig } = await import('../../../lib/outbound-sequence.js');
    const badKeys = validateOutboundSequenceConfig({
      ...VALID_CFG,
      handoffImportContextKeys: ['crmCampaign', '   ', 42]
    });
    expect(badKeys.ok).toBe(false);

    const badCutover = validateOutboundSequenceConfig({
      ...VALID_CFG,
      classicFollowUpCutoverDate: '2026-02-31'
    });
    expect(badCutover.ok).toBe(false);
  });

  test('getValidatedOutboundSequence returns null when env kill switch set', async () => {
    process.env.OUTBOUND_SEQUENCE_DISABLED = '1';
    const { getValidatedOutboundSequence } = await import('../../../lib/outbound-sequence.js');
    expect(getValidatedOutboundSequence({ outboundSequence: VALID_CFG })).toBeNull();
  });

  test('getValidatedOutboundSequence returns null for invalid config (no crash)', async () => {
    const { getValidatedOutboundSequence } = await import('../../../lib/outbound-sequence.js');
    expect(getValidatedOutboundSequence({ outboundSequence: { enabled: true, stages: [] } })).toBeNull();
  });

  test('getHandoffImportContextKeys uses defaults unless tenant overrides them', async () => {
    const { getHandoffImportContextKeys } = await import('../../../lib/outbound-sequence.js');
    expect(getHandoffImportContextKeys({ outboundSequence: VALID_CFG })).toEqual(['crmCampaign', 'laneHint']);
    expect(
      getHandoffImportContextKeys({
        outboundSequence: {
          ...VALID_CFG,
          handoffImportContextKeys: ['shipperCompanyName', 'crmCampaign']
        }
      })
    ).toEqual(['shipperCompanyName', 'crmCampaign']);
  });

  test('getFirstStage / getStageById resolve stage by id', async () => {
    const { getFirstStage, getStageById } = await import('../../../lib/outbound-sequence.js');
    expect(getFirstStage({ outboundSequence: VALID_CFG }).id).toBe('s1');
    expect(getStageById({ outboundSequence: VALID_CFG }, 's2').id).toBe('s2');
    expect(getStageById({ outboundSequence: VALID_CFG }, 'missing')).toBeNull();
  });

  test('isStageComplete enforces every required field non-empty', async () => {
    const { isStageComplete } = await import('../../../lib/outbound-sequence.js');
    const stage = { requiredFields: ['a', 'b'] };
    expect(isStageComplete(stage, { a: '1' })).toBe(false);
    expect(isStageComplete(stage, { a: '1', b: '   ' })).toBe(false);
    expect(isStageComplete(stage, { a: '1', b: 'x' })).toBe(true);
    expect(isStageComplete(stage, { a: '1', b: 0 })).toBe(true);
    expect(isStageComplete(stage, { a: '1', b: false })).toBe(true);
  });

  test('pickNextStage advances only when complete and not skipping stages', async () => {
    const { pickNextStage } = await import('../../../lib/outbound-sequence.js');
    expect(pickNextStage({ outboundSequence: VALID_CFG }, 's1', {})).toEqual({ nextStageId: null, isFinal: false });
    expect(pickNextStage({ outboundSequence: VALID_CFG }, 's1', { decisionMakerName: 'Sam' })).toEqual({
      nextStageId: 's2',
      isFinal: false
    });
    expect(pickNextStage({ outboundSequence: VALID_CFG }, 's2', { originCity: 'Manchester' })).toEqual({
      nextStageId: null,
      isFinal: true
    });
  });

  test('mergeStructuredFromCompletedStages flattens prior snapshots', async () => {
    const { mergeStructuredFromCompletedStages } = await import('../../../lib/outbound-sequence.js');
    const flat = mergeStructuredFromCompletedStages([
      { stageId: 's1', structuredData: { decisionMakerName: 'Sam' } },
      { stageId: 's2', structuredData: { originCity: 'Manchester', destinationCity: 'Berlin' } }
    ]);
    expect(flat).toEqual({ decisionMakerName: 'Sam', originCity: 'Manchester', destinationCity: 'Berlin' });
  });

  test('buildAssistantOverridesForStage produces firstMessage, model, variableValues', async () => {
    const { buildAssistantOverridesForStage } = await import('../../../lib/outbound-sequence.js');
    const stage = VALID_CFG.stages[1];
    const out = buildAssistantOverridesForStage(
      stage,
      { name: 'Acme Logistics', phone: '+447700900111' },
      { displayName: 'D2D Xpress' },
      {
        stagesCompleted: [{ stageId: 's1', structuredData: { decisionMakerName: 'Sam', priorCallWasSubstantive: true } }],
        currentStructured: {},
        isFinalStage: true
      }
    );
    expect(out.firstMessage).toBe('Hi2');
    expect(out.model.messages[0].content).toBe('sys-2');
    expect(out.variableValues.decisionMakerName).toBe('Sam');
    expect(out.variableValues.priorCallWasSubstantive).toBe(true);
    expect(out.variableValues.isFollowUpCall).toBe(true);
    expect(out.variableValues.isFinalStage).toBe(true);
    expect(out.variableValues.tenantBusinessName).toBe('D2D Xpress');
  });

  test('computeNextStageScheduledFor goes through scheduleAtOptimalCallWindow', async () => {
    let callCount = 0;
    jest.unstable_mockModule('../../../lib/optimal-call-window.js', () => ({
      scheduleAtOptimalCallWindow: jest.fn(async (_t, _r, baseline) => {
        callCount += 1;
        const b = baseline instanceof Date ? baseline : new Date(baseline);
        return new Date(b.getTime());
      })
    }));
    const { computeNextStageScheduledFor } = await import('../../../lib/outbound-sequence.js');
    const stage = VALID_CFG.stages[0];
    const out = await computeNextStageScheduledFor(stage, { decisionMakerName: 'Sam' }, new Date(), {
      tenant: { displayName: 'D2D Xpress' },
      routing: null,
      fallbackTz: 'Europe/London',
      clientKey: 'tenant-seq',
      jitterKey: '+447700900111'
    });
    expect(out instanceof Date).toBe(true);
    expect(callCount).toBeGreaterThanOrEqual(1);
    expect(out.getTime()).toBeGreaterThan(Date.now());
  });
});
