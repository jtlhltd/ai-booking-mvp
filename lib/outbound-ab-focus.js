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

const VAPI_EXP_KEYS = /** @type {const} */ ({
  voice: 'outboundAbVoiceExperiment',
  opening: 'outboundAbOpeningExperiment',
  script: 'outboundAbScriptExperiment'
});

/**
 * After stopping one dimensional experiment: clear its vapi slot and adjust focus so multi-dimension dials still resolve.
 * @param {object | null | undefined} existingVapi
 * @param {'voice'|'opening'|'script'} stoppedDim
 * @returns {Record<string, string>}
 */
export function vapiPatchAfterStopOutboundAbDimension(existingVapi, stoppedDim) {
  const d = String(stoppedDim || '').trim().toLowerCase();
  if (d !== 'voice' && d !== 'opening' && d !== 'script') return {};
  const trim = (x) => (x != null && String(x).trim() !== '' ? String(x).trim() : '');
  const v = existingVapi && typeof existingVapi === 'object' ? existingVapi : {};
  const after = {
    voice: d === 'voice' ? '' : trim(v[VAPI_EXP_KEYS.voice]),
    opening: d === 'opening' ? '' : trim(v[VAPI_EXP_KEYS.opening]),
    script: d === 'script' ? '' : trim(v[VAPI_EXP_KEYS.script])
  };
  const remaining = DIM_ORDER.filter((dim) => after[dim]);
  const prevFocus = trim(v.outboundAbFocusDimension).toLowerCase();
  let newFocus = prevFocus;
  if (remaining.length === 0) {
    newFocus = '';
  } else if (remaining.length === 1) {
    newFocus = remaining[0];
  } else if (prevFocus === d || !remaining.includes(prevFocus)) {
    newFocus = remaining[0];
  }
  return {
    [VAPI_EXP_KEYS[d]]: '',
    outboundAbFocusDimension: newFocus
  };
}
