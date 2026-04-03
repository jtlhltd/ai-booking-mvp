// Fill dashboard “control” row previews from Vapi assistant when variant_config is {} (live assistant = control).

import { getVapiAssistantCreativeSnapshot } from './outbound-ab-baseline.js';

function nonEmptyStr(x) {
  return x != null && String(x).trim() !== '' ? String(x).trim() : '';
}

function controlRow(summary) {
  if (!summary?.variants?.length) return null;
  return summary.variants.find((v) => String(v.variantName || '').toLowerCase() === 'control') || null;
}

/**
 * Mutates summaries in place so control arm shows assistant creatives when DB has no stored control slice.
 */
export async function enrichOutboundAbDashboardSummariesFromAssistant(client, bundle) {
  const { voiceSummary, openingSummary, scriptSummary, legacyOutboundAbSummary } = bundle || {};
  const snap = await getVapiAssistantCreativeSnapshot(client);

  const patchDim = (summary, dim) => {
    const row = controlRow(summary);
    if (!row?.tested) return;
    const t = row.tested;
    if (dim === 'voice' && !nonEmptyStr(t.voiceId) && snap.voiceId) {
      t.voiceId = snap.voiceId;
    }
    if (dim === 'opening' && !nonEmptyStr(t.openingLine) && snap.firstMessage) {
      t.openingLine = snap.firstMessage;
    }
    if (dim === 'script' && !nonEmptyStr(t.script) && !nonEmptyStr(t.scriptPreview) && snap.script) {
      const s = snap.script;
      t.scriptPreview = s.length > 280 ? `${s.slice(0, 280).trim()}…` : s;
    }
  };

  patchDim(voiceSummary, 'voice');
  patchDim(openingSummary, 'opening');
  patchDim(scriptSummary, 'script');

  const leg = legacyOutboundAbSummary;
  const lr = controlRow(leg);
  if (lr?.tested) {
    const t = lr.tested;
    if (!nonEmptyStr(t.voiceId) && snap.voiceId) t.voiceId = snap.voiceId;
    if (!nonEmptyStr(t.openingLine) && snap.firstMessage) t.openingLine = snap.firstMessage;
    if (!nonEmptyStr(t.scriptPreview) && !nonEmptyStr(t.script) && snap.script) {
      const s = snap.script;
      t.scriptPreview = s.length > 280 ? `${s.slice(0, 280).trim()}…` : s;
    }
  }
}
