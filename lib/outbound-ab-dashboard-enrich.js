// Dashboard: control row always displays Vapi assistant creatives (never stale DB copies).

import { getVapiAssistantCreativeSnapshot } from './outbound-ab-baseline.js';

function controlRow(summary) {
  if (!summary?.variants?.length) return null;
  return summary.variants.find((v) => String(v.variantName || '').toLowerCase() === 'control') || null;
}

function scriptPreviewFromSnap(script) {
  if (!script || !String(script).trim()) return null;
  const s = String(script).trim();
  return s.length > 280 ? `${s.slice(0, 280).trim()}…` : s;
}

/**
 * Mutates summaries in place: overwrites control row `tested` fields from GET /assistant so UI never mirrors old duplicate DB rows.
 * @param {{ preloadedSnap?: object }} [options] Pass snap from getVapiAssistantCreativeSnapshot to avoid a second Vapi GET.
 */
export async function enrichOutboundAbDashboardSummariesFromAssistant(client, bundle, options = {}) {
  const { voiceSummary, openingSummary, scriptSummary, legacyOutboundAbSummary } = bundle || {};
  const snap =
    options.preloadedSnap != null
      ? options.preloadedSnap
      : await getVapiAssistantCreativeSnapshot(client);

  const patchDim = (summary, dim) => {
    const row = controlRow(summary);
    if (!row?.tested) return;
    const t = row.tested;
    if (dim === 'voice') {
      t.voiceId = snap.voiceId ? String(snap.voiceId).trim() : null;
    }
    if (dim === 'opening') {
      t.openingLine = snap.firstMessage ? String(snap.firstMessage).trim() : null;
    }
    if (dim === 'script') {
      t.scriptPreview = scriptPreviewFromSnap(snap.script);
      if (Object.prototype.hasOwnProperty.call(t, 'script')) t.script = null;
    }
  };

  patchDim(voiceSummary, 'voice');
  patchDim(openingSummary, 'opening');
  patchDim(scriptSummary, 'script');

  const lr = controlRow(legacyOutboundAbSummary);
  if (lr?.tested) {
    const t = lr.tested;
    t.voiceId = snap.voiceId ? String(snap.voiceId).trim() : null;
    t.openingLine = snap.firstMessage ? String(snap.firstMessage).trim() : null;
    t.scriptPreview = scriptPreviewFromSnap(snap.script);
    if (Object.prototype.hasOwnProperty.call(t, 'script')) t.script = null;
  }
}
