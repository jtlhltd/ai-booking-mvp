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

test('dimensional: falls back to first slice with ledger data when focus unset', () => {
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
    legacyOutboundAbSummary: null,
    dialActiveDimensions: []
  });
  assert.equal(p.focusExperiment.experimentName, 'v');
  assert.equal(p.focusExperiment.dimension, 'voice');
  assert.equal(p.reason, null);
});

test('dimensional: prefers sole dial dimension when set', () => {
  const openingSummary = {
    hasDbVariants: true,
    variants: [
      { variantName: 'a', totalLeads: 5, convertedLeads: 0, conversionRatePct: 0 },
      { variantName: 'b', totalLeads: 6, convertedLeads: 1, conversionRatePct: 16.67 }
    ]
  };
  const p = buildOutboundAbLiveResultsPayload({
    client: { vapi: { outboundAbFocusDimension: 'voice' } },
    dimensionalMode: true,
    focusValid: 'voice',
    voiceExpName: 'v',
    voiceSummary: null,
    openingExpName: 'o',
    openingSummary,
    scriptExpName: null,
    scriptSummary: null,
    legacyOutboundAbExperimentName: null,
    legacyOutboundAbSummary: null,
    dialActiveDimensions: ['opening']
  });
  assert.equal(p.focusExperiment.experimentName, 'o');
  assert.equal(p.focusExperiment.dimension, 'opening');
});
