// lib/outbound-ab-focus.js
// One factor at a time: when multiple outbound A/B dimensions have experiment names,
// only one may apply per dial unless exactly one dimension is configured (then it applies implicitly).

const DIM_ORDER = /** @type {const} */ (['voice', 'opening', 'script']);

/**
 * @param {object} opts
 * @param {string} opts.voiceExp
 * @param {string} opts.openingExp
 * @param {string} opts.scriptExp
 * @param {string} [opts.focusDimension] - 'voice' | 'opening' | 'script' | ''
 * @returns {Array<[string, string]>} [dimension, experimentName] pairs to run on this dial (0 or 1 entries)
 */
export function resolveOutboundAbDimensionsForDial({
  voiceExp,
  openingExp,
  scriptExp,
  focusDimension = ''
}) {
  const map = {
    voice: voiceExp != null && String(voiceExp).trim() !== '' ? String(voiceExp).trim() : '',
    opening: openingExp != null && String(openingExp).trim() !== '' ? String(openingExp).trim() : '',
    script: scriptExp != null && String(scriptExp).trim() !== '' ? String(scriptExp).trim() : ''
  };
  const active = DIM_ORDER.filter((d) => map[d]);
  if (active.length === 0) return [];
  if (active.length === 1) {
    const d = active[0];
    return [[d, map[d]]];
  }
  const focus = focusDimension != null ? String(focusDimension).trim().toLowerCase() : '';
  if (focus === 'voice' || focus === 'opening' || focus === 'script') {
    const name = map[focus];
    if (name) return [[focus, name]];
  }
  return [];
}

/**
 * Human-readable issue for dashboard when dials would skip dimensional A/B.
 */
export function outboundAbDialWarning({
  voiceExp,
  openingExp,
  scriptExp,
  focusDimension
}) {
  const map = {
    voice: voiceExp != null && String(voiceExp).trim() !== '' ? String(voiceExp).trim() : '',
    opening: openingExp != null && String(openingExp).trim() !== '' ? String(openingExp).trim() : '',
    script: scriptExp != null && String(scriptExp).trim() !== '' ? String(scriptExp).trim() : ''
  };
  const active = DIM_ORDER.filter((d) => map[d]);
  if (active.length <= 1) return null;
  const pairs = resolveOutboundAbDimensionsForDial({
    voiceExp: map.voice,
    openingExp: map.opening,
    scriptExp: map.script,
    focusDimension
  });
  if (pairs.length > 0) return null;
  const focus = focusDimension != null ? String(focusDimension).trim().toLowerCase() : '';
  if (focus === 'voice' || focus === 'opening' || focus === 'script') {
    if (!map[focus]) {
      return `Active dimension is “${focus}” but no experiment name is set for that slot. Pick another active dimension or add an experiment.`;
    }
  }
  return 'Several A/B dimensions are configured. Choose which single dimension is live on dials (voice, opening line, or script) until that test finishes — then switch.';
}
