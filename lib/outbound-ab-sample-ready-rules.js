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

/**
 * Operator inbox for sample-ready emails: YOUR_EMAIL on the server (e.g. Render), then tenant vapi fallback.
 */
export function resolveSampleReadyNotifyEmail(vapi) {
  const your = process.env.YOUR_EMAIL;
  if (your != null && String(your).trim()) return String(your).trim();
  const tenant = vapi?.outboundAbSampleReadyEmail;
  if (tenant != null && String(tenant).trim()) return String(tenant).trim();
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
