import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOutboundAbLiveResultsPayload } from '../../lib/outbound-ab-live-results.js';

const summaryTwo = {
  hasDbVariants: true,
  variants: [
    { variantName: 'control', totalLeads: 10, convertedLeads: 1, conversionRatePct: 10 },
    { variantName: 'variant_b', totalLeads: 12, convertedLeads: 2, conversionRatePct: 16.67 }
  ]
};

test('dimensional: builds rows for focused dimension', () => {
  const p = buildOutboundAbLiveResultsPayload({
    client: { vapi: { outboundAbFocusDimension: 'voice', outboundAbMinSamplesPerVariant: '30' } },
    dimensionalMode: true,
    focusValid: 'voice',
    voiceExpName: 'exp_voice',
    voiceSummary: summaryTwo,
    openingExpName: 'exp_o',
    openingSummary: null,
    scriptExpName: null,
    scriptSummary: null,
    legacyOutboundAbExperimentName: null,
    legacyOutboundAbSummary: null
  });
  assert.equal(p.focusExperiment.experimentName, 'exp_voice');
  assert.equal(p.focusExperiment.variants[0].leadsUntilMin, 20);
  assert.equal(p.focusExperiment.allVariantsMeetMinSamples, false);
});

test('dimensional: no_focus when focus invalid', () => {
  const p = buildOutboundAbLiveResultsPayload({
    client: { vapi: {} },
    dimensionalMode: true,
    focusValid: '',
    voiceExpName: 'v',
    voiceSummary: summaryTwo,
    openingExpName: null,
    openingSummary: null,
    scriptExpName: null,
    scriptSummary: null,
    legacyOutboundAbExperimentName: null,
    legacyOutboundAbSummary: null
  });
  assert.equal(p.focusExperiment, null);
  assert.equal(p.reason, 'no_focus');
});
