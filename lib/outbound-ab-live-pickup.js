import { mapVapiEndedReasonToOutcome } from './vapi-call-outcome-map.js';

/** Outcomes that mean we did not get a live human pickup (aligns with answered-call SQL elsewhere). */
const NOT_LIVE_OUTCOMES = new Set([
  'no-answer',
  'busy',
  'failed',
  'voicemail',
  'declined',
  'rejected',
  'cancelled',
  'canceled'
]);

/**
 * Resolve the same outcome string the VAPI webhook would store (endedReason can override generic failure).
 * @param {string|null|undefined} outcome
 * @param {string|null|undefined} endedReason
 */
export function resolveStoredCallOutcomeForLivePickup(outcome, endedReason) {
  let o = outcome != null ? String(outcome).trim().toLowerCase() : '';
  if (endedReason) {
    const fromEnded = mapVapiEndedReasonToOutcome(endedReason);
    const oNorm = o;
    const genericTelephony = !oNorm || ['failed', 'error', 'unknown'].includes(oNorm);
    const assistantSetUseful = oNorm && !genericTelephony;
    if (!assistantSetUseful && fromEnded) {
      o = fromEnded;
    }
  }
  return o || '';
}

/** True when the call counts as a live pickup for outbound A/B sample sizing (excludes voicemail / no-answer / etc.). */
export function isOutboundAbLivePickupOutcome(outcome, endedReason) {
  const o = resolveStoredCallOutcomeForLivePickup(outcome, endedReason);
  if (!o) return false;
  if (NOT_LIVE_OUTCOMES.has(o)) return false;
  return true;
}

/** Experiment names attached to this call (dimensional abOutbound + legacy abExperiment). */
export function collectOutboundAbExperimentNamesFromMetadata(metadata) {
  const m = metadata && typeof metadata === 'object' ? metadata : {};
  const out = [];
  const ob = m.abOutbound;
  if (ob && typeof ob === 'object' && !Array.isArray(ob)) {
    for (const dim of ['voice', 'opening', 'script']) {
      const s = ob[dim];
      if (s && s.experiment != null && String(s.experiment).trim()) {
        out.push(String(s.experiment).trim());
      }
    }
  }
  const legacy = m.abExperiment;
  if (legacy != null && String(legacy).trim()) {
    out.push(String(legacy).trim());
  }
  return [...new Set(out)];
}
