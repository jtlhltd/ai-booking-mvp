// Build a compact "live results" payload for the dashboard (same counts as sample-ready email).

import {
  experimentMeetsSampleThreshold,
  parseMinSamplesPerVariant,
  resolveSampleReadyNotifyEmail
} from './outbound-ab-sample-ready-rules.js';

function mapVariantRows(summary, minN) {
  if (!summary?.variants?.length) return null;
  return summary.variants.map((v) => {
    const tl = typeof v.totalLeads === 'number' ? v.totalLeads : parseInt(v.totalLeads, 10) || 0;
    const cl =
      typeof v.convertedLeads === 'number' ? v.convertedLeads : parseInt(v.convertedLeads, 10) || 0;
    return {
      variantName: v.variantName,
      totalLeads: tl,
      convertedLeads: cl,
      conversionRatePct: v.conversionRatePct,
      meetsMinSamples: tl >= minN,
      leadsUntilMin: Math.max(0, minN - tl)
    };
  });
}

/**
 * @param {object} p
 * @returns {{ serverTime: string, minSamplesPerVariant: number, notifyEmailConfigured: boolean, focusExperiment: object|null }}
 */
export function buildOutboundAbLiveResultsPayload(p) {
  const {
    client,
    dimensionalMode,
    focusValid,
    voiceExpName,
    voiceSummary,
    openingExpName,
    openingSummary,
    scriptExpName,
    scriptSummary,
    legacyOutboundAbExperimentName,
    legacyOutboundAbSummary
  } = p;

  const vapi = client?.vapi && typeof client.vapi === 'object' ? client.vapi : {};
  const minN = parseMinSamplesPerVariant(vapi);
  const serverTime = new Date().toISOString();
  const notifyEmailConfigured = !!resolveSampleReadyNotifyEmail(vapi);

  if (dimensionalMode && focusValid) {
    const slots = {
      voice: { experimentName: voiceExpName, summary: voiceSummary },
      opening: { experimentName: openingExpName, summary: openingSummary },
      script: { experimentName: scriptExpName, summary: scriptSummary }
    };
    const slot = slots[focusValid];
    const exp = slot?.experimentName != null ? String(slot.experimentName).trim() : '';
    if (!exp || !slot.summary) {
      return {
        serverTime,
        minSamplesPerVariant: minN,
        notifyEmailConfigured,
        focusExperiment: null,
        reason: 'no_summary'
      };
    }
    const variants = mapVariantRows(slot.summary, minN);
    if (!variants) {
      return {
        serverTime,
        minSamplesPerVariant: minN,
        notifyEmailConfigured,
        focusExperiment: null,
        reason: 'no_variants'
      };
    }
    return {
      serverTime,
      minSamplesPerVariant: minN,
      notifyEmailConfigured,
      focusExperiment: {
        dimension: focusValid,
        experimentName: exp,
        variants,
        allVariantsMeetMinSamples: experimentMeetsSampleThreshold(slot.summary, minN)
      },
      reason: null
    };
  }

  if (!dimensionalMode && legacyOutboundAbExperimentName && legacyOutboundAbSummary) {
    const exp = String(legacyOutboundAbExperimentName).trim();
    const variants = mapVariantRows(legacyOutboundAbSummary, minN);
    if (!variants) {
      return {
        serverTime,
        minSamplesPerVariant: minN,
        notifyEmailConfigured,
        focusExperiment: null,
        reason: 'no_variants'
      };
    }
    return {
      serverTime,
      minSamplesPerVariant: minN,
      notifyEmailConfigured,
      focusExperiment: {
        dimension: null,
        experimentName: exp,
        variants,
        allVariantsMeetMinSamples: experimentMeetsSampleThreshold(legacyOutboundAbSummary, minN)
      },
      reason: null
    };
  }

  return {
    serverTime,
    minSamplesPerVariant: minN,
    notifyEmailConfigured,
    focusExperiment: null,
    reason: dimensionalMode ? 'no_focus' : 'no_legacy_experiment'
  };
}
