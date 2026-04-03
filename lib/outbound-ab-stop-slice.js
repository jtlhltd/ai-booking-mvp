// Pure helpers: which active A/B variant rows belong to an outbound dimensional slice (for stop/cleanup).

function parseAbVariantConfigJson(raw) {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof raw === 'object') return raw;
  return null;
}

function variantConfigFieldPresence(c) {
  if (!c || typeof c !== 'object') {
    return { hasVoice: false, hasOpening: false, hasScript: false };
  }
  let hasVoice = false;
  if (typeof c.voice === 'string' && c.voice.trim()) hasVoice = true;
  else if (c.voice && typeof c.voice === 'object' && c.voice.voiceId && String(c.voice.voiceId).trim()) {
    hasVoice = true;
  }
  const open = c.firstMessage != null ? String(c.firstMessage).trim() : '';
  const hasOpening = open.length > 0;
  const scriptRaw =
    c.systemMessage != null ? String(c.systemMessage) : c.script != null ? String(c.script) : '';
  const hasScript = scriptRaw.trim().length > 0;
  return { hasVoice, hasOpening, hasScript };
}

function activeRowsAreVoiceOnly(rows) {
  if (!rows || rows.length < 2) return false;
  for (const r of rows) {
    const p = variantConfigFieldPresence(parseAbVariantConfigJson(r.variant_config));
    if (!p.hasVoice || p.hasOpening || p.hasScript) return false;
  }
  return true;
}

function activeRowsAreOpeningOnly(rows) {
  if (!rows || rows.length < 2) return false;
  for (const r of rows) {
    const p = variantConfigFieldPresence(parseAbVariantConfigJson(r.variant_config));
    if (!p.hasOpening || p.hasVoice || p.hasScript) return false;
  }
  return true;
}

function activeRowsAreScriptOnly(rows) {
  if (!rows || rows.length < 2) return false;
  for (const r of rows) {
    const p = variantConfigFieldPresence(parseAbVariantConfigJson(r.variant_config));
    if (!p.hasScript || p.hasVoice || p.hasOpening) return false;
  }
  return true;
}

function activeRowsAreVoiceDimensionalSlice(rows) {
  if (!rows || rows.length < 2) return false;
  let challengerHasVoice = false;
  for (const r of rows) {
    const p = variantConfigFieldPresence(parseAbVariantConfigJson(r.variant_config));
    if (p.hasOpening || p.hasScript) return false;
    const vn = String(r.variant_name || '').toLowerCase();
    if (vn === 'control') {
      if (p.hasVoice) return false;
    } else if (p.hasVoice) {
      challengerHasVoice = true;
    }
  }
  return challengerHasVoice;
}

function activeRowsAreOpeningDimensionalSlice(rows) {
  if (!rows || rows.length < 2) return false;
  let challengerHasOpening = false;
  for (const r of rows) {
    const p = variantConfigFieldPresence(parseAbVariantConfigJson(r.variant_config));
    if (p.hasVoice || p.hasScript) return false;
    const vn = String(r.variant_name || '').toLowerCase();
    if (vn === 'control') {
      if (p.hasOpening) return false;
    } else if (p.hasOpening) {
      challengerHasOpening = true;
    }
  }
  return challengerHasOpening;
}

function activeRowsAreScriptDimensionalSlice(rows) {
  if (!rows || rows.length < 2) return false;
  let challengerHasScript = false;
  for (const r of rows) {
    const p = variantConfigFieldPresence(parseAbVariantConfigJson(r.variant_config));
    if (p.hasVoice || p.hasOpening) return false;
    const vn = String(r.variant_name || '').toLowerCase();
    if (vn === 'control') {
      if (p.hasScript) return false;
    } else if (p.hasScript) {
      challengerHasScript = true;
    }
  }
  return challengerHasScript;
}

/**
 * Whether active variant rows for one experiment belong to this outbound A/B dimension slice
 * (dimensional control `{}` + challenger, or legacy “every variant carries that field only”).
 */
export function activeRowsMatchOutboundAbStopSlice(rows, dimension) {
  const d = String(dimension || '').trim().toLowerCase();
  if (d === 'voice') {
    return activeRowsAreVoiceDimensionalSlice(rows) || activeRowsAreVoiceOnly(rows);
  }
  if (d === 'opening') {
    return activeRowsAreOpeningDimensionalSlice(rows) || activeRowsAreOpeningOnly(rows);
  }
  if (d === 'script') {
    return activeRowsAreScriptDimensionalSlice(rows) || activeRowsAreScriptOnly(rows);
  }
  return false;
}
