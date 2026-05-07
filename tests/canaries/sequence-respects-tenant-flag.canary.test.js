/**
 * Canary for Intent Contract: sequence.tenant-opt-in-required
 */
import { describe, expect, test } from '@jest/globals';
import { getValidatedOutboundSequence } from '../../lib/outbound-sequence.js';

describe('canary: sequence.tenant-opt-in-required', () => {
  test('legacy tenant without enabled flag returns null', () => {
    expect(getValidatedOutboundSequence({ outboundSequence: null })).toBeNull();
    expect(getValidatedOutboundSequence({ outboundSequence: { enabled: false, stages: [] } })).toBeNull();
  });
});
