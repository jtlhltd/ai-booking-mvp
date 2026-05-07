/**
 * Canary for Intent Contract: sequence.stage-config-validation
 */
import { describe, expect, test } from '@jest/globals';
import { validateOutboundSequenceConfig } from '../../lib/outbound-sequence.js';

describe('canary: sequence.stage-config-validation', () => {
  test('invalid enabled config is rejected', () => {
    const bad = validateOutboundSequenceConfig({
      enabled: true,
      stages: [{ id: 'a', firstMessage: '', systemMessage: 'x', requiredFields: [], maxAttemptsInStage: 0 }]
    });
    expect(bad.ok).toBe(false);
  });

  test('valid 3-stage Tom-shaped config passes', () => {
    const good = validateOutboundSequenceConfig({
      enabled: true,
      maxTotalDialsPerLead: 7,
      maxSequenceDurationDays: 14,
      stages: [
        {
          id: 's1',
          firstMessage: 'Hi',
          systemMessage: 'Sys1',
          structuredOutputId: '00000000-0000-4000-8000-000000000001',
          requiredFields: ['decisionMakerName'],
          maxAttemptsInStage: 3,
          nextStage: 's2',
          scheduling: { minDelayMinutesBeforeNext: 1, maxDelayMinutesBeforeNext: 2 }
        },
        {
          id: 's2',
          firstMessage: 'Hi2',
          systemMessage: 'Sys2',
          structuredOutputId: '00000000-0000-4000-8000-000000000002',
          requiredFields: ['originCity'],
          maxAttemptsInStage: 3,
          nextStage: 's3',
          scheduling: { minDelayMinutesBeforeNext: 1, maxDelayMinutesBeforeNext: 2 }
        },
        {
          id: 's3',
          firstMessage: 'Hi3',
          systemMessage: 'Sys3',
          structuredOutputId: '00000000-0000-4000-8000-000000000003',
          requiredFields: ['timeline'],
          maxAttemptsInStage: 3,
          isFinal: true,
          scheduling: {}
        }
      ]
    });
    expect(good.ok).toBe(true);
  });
});
