// lib/outbound-ab-upload-spec.js
// Parse dashboard JSON upload for outbound A/B (one dimension per test).

/**
 * @param {string} jsonText
 * @param {string} dimension - voice | opening | script
 * @returns {{ variants: Array<{ name: string, voice?: string, firstMessage?: string, script?: string }>, experimentName: string }}
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
  } else if (root && typeof root === 'object' && Array.isArray(root.variants)) {
    rows = root.variants;
    if (root.experimentName != null) experimentName = String(root.experimentName).trim();
  } else {
    throw new Error(
      'JSON must be either an array of variants or { "experimentName": "optional_name", "variants": [ ... ] }'
    );
  }
  const keys = {
    voice: ['voice', 'voiceId', 'value'],
    opening: ['opening', 'firstMessage', 'openingLine', 'value'],
    script: ['script', 'systemMessage', 'value']
  };
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
  if (out.length < 2) {
    throw new Error('At least two variants are required');
  }
  return { variants: out, experimentName };
}
