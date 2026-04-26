import { describe, expect, test } from '@jest/globals';

describe('lib/vapi-call-outcome-map', () => {
  test('maps common endedReason variants to normalized outcomes', async () => {
    const { mapVapiEndedReasonToOutcome } = await import('../../../lib/vapi-call-outcome-map.js');
    expect(mapVapiEndedReasonToOutcome(null)).toBeNull();
    expect(mapVapiEndedReasonToOutcome('customer-did-not-answer')).toBe('no-answer');
    expect(mapVapiEndedReasonToOutcome('customer-busy')).toBe('busy');
    expect(mapVapiEndedReasonToOutcome('voicemail')).toBe('voicemail');
    expect(mapVapiEndedReasonToOutcome('failed-to-connect')).toBe('declined');
    expect(mapVapiEndedReasonToOutcome('assistant-ended-call')).toBe('completed');
    expect(mapVapiEndedReasonToOutcome('silence-timed-out')).toBe('completed');
    expect(mapVapiEndedReasonToOutcome('fatal-error')).toBe('failed');
  });
});

