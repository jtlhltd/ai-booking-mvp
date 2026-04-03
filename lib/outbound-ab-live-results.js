// Build a compact "live results" payload for the dashboard (same counts as sample-ready email).

import {
  experimentMeetsSampleThreshold,
  parseMinSamplesPerVariant,
  resolveSampleReadyNotifyEmail
} from './outbound-ab-sample-ready-rules.js';

const DIM_ORDER = /** @type {const} */ (['voice', 'opening', 'script']);

function slotHasLedgerVariants(slot) {
  if (!slot || typeof slot !== 'object') return false;
  const exp = slot.experimentName != null ? String(slot.experimentName).trim() : '';
  const vars = slot.summary?.variants;
  return !!(exp && Array.isArray(vars) && vars.length > 0);
}

/**
 * Pick which dimensional experiment to show in the monitoring table when focus is unset
 * or points at a slice with no ledger rows yet.
 */
function pickEffectiveDimensionalFocus(p) {
  const {
    dimensionalMode,
    focusValid,
    voiceExpName,
    voiceSummary,
    openingExpName,
    openingSummary,
    scriptExpName,
    scriptSummary,
    dialActiveDimensions
  } = p;

  if (!dimensionalMode) return '';

  const slots = {
    voice: { experimentName: voiceExpName, summary: voiceSummary },
    opening: { experimentName: openingExpName, summary: openingSummary },
    script: { experimentName: scriptExpName, summary: scriptSummary }
  };

  const dialDims = Array.isArray(dialActiveDimensions) ? dialActiveDimensions : [];
  if (dialDims.length === 1) {
    const d = dialDims[0];
    if ((d === 'voice' || d === 'opening' || d === 'script') && slotHasLedgerVariants(slots[d])) {
      return d;
    }
  }

  const fv =
    focusValid === 'voice' || focusValid === 'opening' || focusValid === 'script' ? focusValid : '';
  if (fv && slotHasLedgerVariants(slots[fv])) return fv;

  for (const d of DIM_ORDER) {
    if (slotHasLedgerVariants(slots[d])) return d;
  }

  return '';
}

function mapVariantRows(summary, minN) {
  if (!summary?.variants?.length) return null;
  return summary.variants.map((v) => {
    const tl = typeof v.totalLeads === 'number' ? v.totalLeads : parseInt(v.totalLeads, 10) || 0;
    const lpu =
      typeof v.livePickupLeads === 'number' ? v.livePickupLeads : parseInt(v.livePickupLeads, 10) || 0;
    const cl =
      typeof v.convertedLeads === 'number' ? v.convertedLeads : parseInt(v.convertedLeads, 10) || 0;
    const fu =
      typeof v.followUpLeads === 'number' ? v.followUpLeads : parseInt(v.followUpLeads, 10) || 0;
    return {
      variantName: v.variantName,
      totalLeads: tl,
      livePickupLeads: lpu,
      convertedLeads: cl,
      conversionRatePct: v.conversionRatePct,
      followUpLeads: fu,
      followUpRatePct: v.followUpRatePct,
      meetsMinSamples: lpu >= minN,
      leadsUntilMin: Math.max(0, minN - lpu)
    };
  });
}

/**
 * @param {object} p
 * @param {string[]} [p.dialActiveDimensions]
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
    legacyOutboundAbSummary,
    dialActiveDimensions
  } = p;

  const vapi = client?.vapi && typeof client.vapi === 'object' ? client.vapi : {};
  const minN = parseMinSamplesPerVariant(vapi);
  const serverTime = new Date().toISOString();
  const notifyEmailConfigured = !!resolveSampleReadyNotifyEmail(vapi);

  const slots = {
    voice: { experimentName: voiceExpName, summary: voiceSummary },
    opening: { experimentName: openingExpName, summary: openingSummary },
    script: { experimentName: scriptExpName, summary: scriptSummary }
  };

  const effectiveFocus = pickEffectiveDimensionalFocus({
    dimensionalMode,
    focusValid,
    voiceExpName,
    voiceSummary,
    openingExpName,
    openingSummary,
    scriptExpName,
    scriptSummary,
    dialActiveDimensions
  });

  if (dimensionalMode && effectiveFocus) {
    const slot = slots[effectiveFocus];
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
        dimension: effectiveFocus,
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
    reason: dimensionalMode ? 'no_experiment_data' : 'no_legacy_experiment'
  };
}
