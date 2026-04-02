// Pure helpers for outbound A/B "sample ready" notifications (no DB / email).

export function parseMinSamplesPerVariant(vapi) {
  const fromVapi = vapi?.outboundAbMinSamplesPerVariant;
  if (fromVapi != null && String(fromVapi).trim() !== '') {
    const n = parseInt(String(fromVapi), 10);
    if (Number.isFinite(n) && n >= 2) return n;
  }
  const e = process.env.OUTBOUND_AB_MIN_SAMPLES_PER_VARIANT;
  if (e != null && String(e).trim() !== '') {
    const n = parseInt(String(e), 10);
    if (Number.isFinite(n) && n >= 2) return n;
  }
  return 30;
}

export function resolveSampleReadyNotifyEmail(vapi) {
  const a = vapi?.outboundAbSampleReadyEmail;
  if (a != null && String(a).trim()) return String(a).trim();
  const env = process.env.OUTBOUND_AB_SAMPLE_READY_EMAIL;
  if (env != null && String(env).trim()) return String(env).trim();
  return '';
}

export function getSampleReadyNotifiedMap(vapi) {
  const raw = vapi?.outboundAbSampleReadyNotified;
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return { ...raw };
  if (typeof raw === 'string') {
    try {
      const o = JSON.parse(raw);
      return o && typeof o === 'object' && !Array.isArray(o) ? { ...o } : {};
    } catch {
      return {};
    }
  }
  return {};
}

/** @param {object|null|undefined} summary - from getOutboundAbExperimentSummary */
export function experimentMeetsSampleThreshold(summary, minPerVariant) {
  if (!summary || !summary.hasDbVariants || !Array.isArray(summary.variants) || summary.variants.length < 2) {
    return false;
  }
  for (const v of summary.variants) {
    const n = typeof v.totalLeads === 'number' ? v.totalLeads : parseInt(v.totalLeads, 10) || 0;
    if (n < minPerVariant) return false;
  }
  return true;
}
