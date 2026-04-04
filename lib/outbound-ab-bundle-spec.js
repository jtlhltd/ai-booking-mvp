// lib/outbound-ab-bundle-spec.js
// One upload: voice IDs + opening lines + scripts → three outbound A/B experiments (OFAT phases).

import { validateElevenLabsVoiceIdForAb } from './elevenlabs-voice-id.js';

export function variantLabels(count) {
  const n = Number(count);
  if (!Number.isFinite(n) || n < 2) {
    throw new Error('Each list needs at least 2 entries');
  }
  if (n === 2) return ['control', 'variant_b'];
  return Array.from({ length: n }, (_, i) => `variant_${i}`);
}

/**
 * @param {'voice'|'opening'|'script'} dimension
 * @param {string[]} values
 * @returns {Array<{ name: string, config: object }>}
 */
export function stringsToMappedVariants(dimension, values) {
  const dim = String(dimension || '')
    .trim()
    .toLowerCase();
  if (dim !== 'voice' && dim !== 'opening' && dim !== 'script') {
    throw new Error('dimension must be voice, opening, or script');
  }
  if (!Array.isArray(values)) {
    throw new Error('Expected an array of strings');
  }
  const labels = variantLabels(values.length);
  return labels.map((name, i) => {
    const val = values[i] == null ? '' : String(values[i]).trim();
    if (!val) {
      throw new Error(`Empty ${dim} for variant "${name}"`);
    }
    if (dim === 'voice') {
      const vr = validateElevenLabsVoiceIdForAb(val);
      if (!vr.ok) throw new Error(vr.error);
      return { name, config: { voice: vr.id } };
    }
    if (dim === 'opening') return { name, config: { firstMessage: val } };
    return { name, config: { script: val } };
  });
}

function takeStringArray(root, keys) {
  if (!root || typeof root !== 'object' || Array.isArray(root)) return null;
  for (const k of keys) {
    if (!Array.isArray(root[k]) || root[k].length < 1) continue;
    const out = root[k].map((x) => (x == null ? '' : String(x).trim()));
    if (!out.every((s) => s.length > 0)) {
      throw new Error(`Empty entry in "${k}" — each value must be non-empty`);
    }
    return out;
  }
  return null;
}

/**
 * @param {string} jsonText
 * @returns {{ voices: string[], openings: string[], scripts: string[] }} Always at least two entries per array (single creative is duplicated for A/B storage).
 */
export function parseOutboundAbBundleSpec(jsonText) {
  let root;
  try {
    root = JSON.parse(String(jsonText || '').trim());
  } catch {
    throw new Error('Invalid JSON');
  }
  if (!root || typeof root !== 'object' || Array.isArray(root)) {
    throw new Error('JSON must be an object with voices, openings, and scripts arrays');
  }
  const voices = takeStringArray(root, ['voices', 'voiceIds', 'voice']);
  const openings = takeStringArray(root, ['openings', 'openingLines', 'openers', 'opening']);
  const scripts = takeStringArray(root, ['scripts', 'scriptBodies', 'script']);
  if (!voices) {
    throw new Error('Missing "voices" (or voiceIds): need an array of at least 1 non-empty voice ID');
  }
  if (!openings) {
    throw new Error('Missing "openings" (or openingLines): need an array of at least 1 non-empty line');
  }
  if (!scripts) {
    throw new Error('Missing "scripts": need an array of at least 1 non-empty script string');
  }
  if (voices.length !== openings.length || voices.length !== scripts.length) {
    throw new Error('voices, openings, and scripts must have the same number of entries');
  }
  if (voices.length === 1) {
    const v = voices[0];
    const o = openings[0];
    const s = scripts[0];
    return { voices: [v, v], openings: [o, o], scripts: [s, s] };
  }
  return { voices, openings, scripts };
}
