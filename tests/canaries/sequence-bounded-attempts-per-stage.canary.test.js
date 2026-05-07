/**
 * Canary for Intent Contract: sequence.bounded-attempts-per-stage
 * intent: sequence.bounded-attempts-per-stage
 */
import { describe, expect, test } from '@jest/globals';
import { isStageComplete } from '../../lib/outbound-sequence.js';

describe('canary: sequence.bounded-attempts-per-stage', () => {
  test('isStageComplete gates advancement on required fields only', () => {
    const stage = { requiredFields: ['a', 'b'], maxAttemptsInStage: 3 };
    expect(isStageComplete(stage, { a: '1' })).toBe(false);
    expect(isStageComplete(stage, { a: '1', b: '2' })).toBe(true);
  });
});
