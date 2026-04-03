import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectOutboundAbExperimentNamesFromMetadata,
  isOutboundAbLivePickupOutcome,
  resolveStoredCallOutcomeForLivePickup
} from '../../lib/outbound-ab-live-pickup.js';

test('isOutboundAbLivePickupOutcome: voicemail is false', () => {
  assert.equal(isOutboundAbLivePickupOutcome('voicemail', null), false);
  assert.equal(isOutboundAbLivePickupOutcome('failed', 'voicemail'), false);
});

test('isOutboundAbLivePickupOutcome: no-answer is false', () => {
  assert.equal(isOutboundAbLivePickupOutcome('no-answer', null), false);
  assert.equal(isOutboundAbLivePickupOutcome('failed', 'customer-did-not-answer'), false);
});

test('isOutboundAbLivePickupOutcome: completed / interested count', () => {
  assert.equal(isOutboundAbLivePickupOutcome('completed', null), true);
  assert.equal(isOutboundAbLivePickupOutcome('interested', null), true);
  assert.equal(isOutboundAbLivePickupOutcome('failed', 'assistant-ended-call'), true);
});

test('collectOutboundAbExperimentNamesFromMetadata: dimensional + legacy deduped', () => {
  const names = collectOutboundAbExperimentNamesFromMetadata({
    abOutbound: {
      voice: { experiment: 'ev', variant: 'a' },
      opening: { experiment: 'eo', variant: 'b' },
      script: { experiment: 'ev', variant: 'c' }
    },
    abExperiment: 'legacy_x'
  });
  assert.deepEqual(names.sort(), ['eo', 'ev', 'legacy_x'].sort());
});

test('resolveStoredCallOutcomeForLivePickup: explicit voicemail beats generic failed mapping', () => {
  assert.equal(resolveStoredCallOutcomeForLivePickup('voicemail', 'assistant-ended-call'), 'voicemail');
});
