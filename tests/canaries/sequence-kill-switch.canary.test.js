/**
 * Canary for Intent Contract: sequence.kill-switch-honored
 */
import { describe, expect, test, afterEach } from '@jest/globals';
import { getValidatedOutboundSequence, isOutboundSequenceGloballyDisabled } from '../../lib/outbound-sequence.js';

describe('canary: sequence.kill-switch-honored', () => {
  afterEach(() => {
    delete process.env.OUTBOUND_SEQUENCE_DISABLED;
  });

  test('OUTBOUND_SEQUENCE_DISABLED=1 disables sequence even when enabled in JSON', () => {
    process.env.OUTBOUND_SEQUENCE_DISABLED = '1';
    expect(isOutboundSequenceGloballyDisabled()).toBe(true);
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
            requiredFields: ['a'],
            maxAttemptsInStage: 3,
            isFinal: true,
            scheduling: {}
          }
        ]
      }
    };
    expect(getValidatedOutboundSequence(client)).toBeNull();
  });
});
