/**
 * Canary for Intent Contract: sequence.advance-only-when-required-filled
 * intent: sequence.no-skip-stages
 */
import { describe, expect, test, jest, beforeEach } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
});

describe('canary: sequence.advance-only-when-required-filled', () => {
  test('pickNextStage does not advance when required fields missing', async () => {
    const { pickNextStage, getStageById } = await import('../../lib/outbound-sequence.js');
    const client = {
      outboundSequence: {
        enabled: true,
        maxTotalDialsPerLead: 7,
        maxSequenceDurationDays: 14,
        stages: [
          {
            id: 's1',
            firstMessage: 'Hi',
            systemMessage: 'S',
            requiredFields: ['decisionMakerName'],
            maxAttemptsInStage: 3,
            nextStage: 's2',
            scheduling: { minDelayMinutesBeforeNext: 1, maxDelayMinutesBeforeNext: 2 }
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
      }
    };
    expect(getStageById(client, 's1')).toBeTruthy();
    const incomplete = pickNextStage(client, 's1', {});
    expect(incomplete.nextStageId).toBeNull();
    expect(incomplete.isFinal).toBe(false);

    const done = pickNextStage(client, 's1', { decisionMakerName: 'Alex' });
    expect(done.nextStageId).toBe('s2');
  });
});
