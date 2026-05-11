/**
 * Per-lead JSON stored in `leads.lead_dial_context_json` for optional variableValues
 * overlay on outbound dials. Sequence / worker code sets authoritative keys
 * (leadName, tenantBusinessName, …); imported context must not override them.
 */

/** Max UTF-8 byte length of serialized JSON after reserved-key stripping (writers should enforce). */
export const LEAD_DIAL_CONTEXT_MAX_BYTES = 24 * 1024;

/**
 * Keys that outbound-sequence / instant-calling own for Vapi variable substitution.
 * @type {ReadonlySet<string>}
 */
export const RESERVED_LEAD_DIAL_CONTEXT_KEYS = new Set([
  'leadName',
  'tenantBusinessName',
  'decisionMakerName',
  'decisionMakerRole',
  'bestCallbackWindow',
  'priorCallWasSubstantive',
  'daysSinceLastCall',
  'isFollowUpCall',
  'isFinalStage',
  'client_key',
  'tenant_key',
  'phone',
  'lead_contact_phone',
  'email'
]);

/**
 * @param {Record<string, unknown>} input
 * @returns {Record<string, unknown>}
 */
export function stripReservedLeadDialContextKeys(input) {
  const out = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  for (const k of Object.keys(input)) {
    if (RESERVED_LEAD_DIAL_CONTEXT_KEYS.has(k)) continue;
    out[k] = input[k];
  }
  return out;
}

/**
 * `assistantOverrides.variableValues` is safest when limited to JSON scalars.
 * Drop nested objects/arrays/functions so lead JSON can only provide simple values.
 * @param {Record<string, unknown>} input
 * @returns {Record<string, string | number | boolean | null>}
 */
export function filterLeadDialContextToScalars(input) {
  const out = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  for (const [k, v] of Object.entries(input)) {
    if (v == null || typeof v === 'string' || typeof v === 'boolean') {
      out[k] = v;
      continue;
    }
    if (typeof v === 'number' && Number.isFinite(v)) {
      out[k] = v;
    }
  }
  return out;
}

/**
 * @param {unknown} raw DB value: JSONB object, stringified JSON (SQLite), or null
 * @returns {Record<string, unknown>}
 */
export function parseLeadDialContextFromDb(raw) {
  return normalizeLeadDialContext(raw);
}

/**
 * @param {Record<string, unknown>} obj after stripReservedLeadDialContextKeys
 * @returns {number} UTF-8 byte length of JSON.stringify
 */
export function leadDialContextSerializedByteLength(obj) {
  if (!obj || typeof obj !== 'object') return 0;
  try {
    return Buffer.byteLength(JSON.stringify(obj), 'utf8');
  } catch {
    return LEAD_DIAL_CONTEXT_MAX_BYTES + 1;
  }
}

/**
 * @param {Record<string, unknown>} obj
 * @returns {{ ok: true, bytes: number } | { ok: false, bytes: number, error: string }}
 */
export function validateLeadDialContextSize(obj, maxBytes = LEAD_DIAL_CONTEXT_MAX_BYTES) {
  const bytes = leadDialContextSerializedByteLength(obj);
  if (bytes > maxBytes) {
    return {
      ok: false,
      bytes,
      error: `lead_dial_context_json exceeds ${maxBytes} bytes`
    };
  }
  return { ok: true, bytes };
}

/**
 * Parse, strip reserved keys, keep scalar values only, and drop oversize payloads.
 * Safe to call both on DB rows and on direct call-site input.
 * @param {unknown} raw DB value: JSONB object, stringified JSON (SQLite), or null
 * @param {{ maxBytes?: number }} [options]
 * @returns {Record<string, string | number | boolean | null>}
 */
export function normalizeLeadDialContext(raw, options = {}) {
  let parsed = {};
  if (raw == null) return parsed;
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t) return parsed;
    try {
      const decoded = JSON.parse(t);
      parsed =
        decoded && typeof decoded === 'object' && !Array.isArray(decoded)
          ? /** @type {Record<string, unknown>} */ (decoded)
          : {};
    } catch {
      return {};
    }
  } else if (typeof raw === 'object' && !Array.isArray(raw)) {
    parsed = /** @type {Record<string, unknown>} */ (raw);
  } else {
    return {};
  }

  const scalarOnly = filterLeadDialContextToScalars(stripReservedLeadDialContextKeys(parsed));
  return validateLeadDialContextSize(scalarOnly, options.maxBytes).ok ? scalarOnly : {};
}
