// lib/outbound-ab-upload-spec.js
// Parse dashboard JSON upload for outbound A/B (one dimension per test).

const VALUE_KEYS = {
  voice: ['voice', 'voiceId', 'value'],
  opening: ['opening', 'firstMessage', 'openingLine', 'value'],
  script: ['script', 'systemMessage', 'value']
};

/**
 * @param {object} root
 * @param {'voice'|'opening'|'script'} dimRaw
 * @returns {object | null}
 */
function variantRowFromFlatRoot(root, dimRaw) {
  let rawVal = '';
  for (const k of VALUE_KEYS[dimRaw]) {
    if (root[k] != null && String(root[k]).trim() !== '') {
      rawVal = String(root[k]);
      break;
    }
  }
  if (!rawVal.trim()) return null;
  const val = rawVal.trim();
  const name = String(root.name || root.variantName || 'control').trim() || 'control';
  if (dimRaw === 'voice') return { name, voice: val };
  if (dimRaw === 'opening') return { name, firstMessage: val };
  return { name, script: val };
}

/**
 * @param {string} jsonText
 * @param {string} dimension - voice | opening | script
 * @returns {{
 *   variants: Array<{ name: string, voice?: string, firstMessage?: string, script?: string }>,
 *   experimentName: string,
 *   controlFromLive: boolean
 * }}
 */
export function parseOutboundAbUploadSpec(jsonText, dimension) {
  const dimRaw = String(dimension || '')
    .trim()
    .toLowerCase();
  if (dimRaw !== 'voice' && dimRaw !== 'opening' && dimRaw !== 'script') {
    throw new Error('dimension must be "voice", "opening", or "script"');
  }
  let root;
  try {
    root = JSON.parse(String(jsonText || '').trim());
  } catch {
    throw new Error('Invalid JSON — check commas and quotes');
  }
  let rows;
  let experimentName = '';
  if (Array.isArray(root)) {
    rows = root;
  } else if (root && typeof root === 'object') {
    if (Object.prototype.hasOwnProperty.call(root, 'variants')) {
      if (!Array.isArray(root.variants)) {
        throw new Error('"variants" must be an array');
      }
      rows = root.variants;
      if (root.experimentName != null) experimentName = String(root.experimentName).trim();
    } else {
      const flat = variantRowFromFlatRoot(root, dimRaw);
      if (!flat) {
        throw new Error(
          'JSON must be an array of variants, { "variants": [ ... ] }, or a single-value object for this dimension (e.g. { "script": "..." })'
        );
      }
      rows = [flat];
      if (root.experimentName != null) experimentName = String(root.experimentName).trim();
    }
  } else {
    throw new Error(
      'JSON must be either an array of variants or { "experimentName": "optional_name", "variants": [ ... ] }'
    );
  }
  if (!rows.length) {
    throw new Error('At least one variant is required');
  }
  const keys = VALUE_KEYS;
  const out = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error('Each variant must be a JSON object');
    }
    const name = String(row.name || row.variantName || '').trim();
    if (!name) {
      throw new Error('Each variant needs "name" (or "variantName")');
    }
    let rawVal = '';
    for (const k of keys[dimRaw]) {
      if (row[k] != null && String(row[k]).trim() !== '') {
        rawVal = String(row[k]);
        break;
      }
    }
    const val = rawVal.trim();
    if (!val) {
      throw new Error(
        `Variant "${name}" is missing a value — use one of: ${keys[dimRaw].join(', ')} for ${dimRaw} tests`
      );
    }
    if (dimRaw === 'voice') out.push({ name, voice: val });
    else if (dimRaw === 'opening') out.push({ name, firstMessage: val });
    else out.push({ name, script: val });
  }
  const controlFromLive = out.length === 1;
  if (out.length === 0) {
    throw new Error('At least one variant is required');
  }
  return { variants: out, experimentName, controlFromLive };
}
