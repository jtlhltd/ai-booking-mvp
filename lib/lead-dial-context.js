/**
 * Per-lead JSON stored in `leads.lead_dial_context_json` for optional variableValues
 * overlay on outbound dials. Sequence / worker code sets authoritative keys
 * (leadName, tenantBusinessName, …); imported context must not override them.
 */

/** Max UTF-8 byte length of serialized JSON after reserved-key stripping (writers should enforce). */
export const LEAD_DIAL_CONTEXT_MAX_BYTES = 24 * 1024;

/**
 * Keys that outbound-sequence / instant-calling own for Vapi variable substitution.
 * Strips only own-enumerable string keys on the parsed object (shallow).
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
 * @param {unknown} raw DB value: JSONB object, stringified JSON (SQLite), or null
 * @returns {Record<string, unknown>}
 */
export function parseLeadDialContextFromDb(raw) {
  if (raw == null) return {};
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t) return {};
    try {
      const parsed = JSON.parse(t);
      return stripReservedLeadDialContextKeys(
        parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? /** @type {Record<string, unknown>} */ (parsed) : {}
      );
    } catch {
      return {};
    }
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return stripReservedLeadDialContextKeys(/** @type {Record<string, unknown>} */ (raw));
  }
  return {};
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
export function validateLeadDialContextSize(obj) {
  const bytes = leadDialContextSerializedByteLength(obj);
  if (bytes > LEAD_DIAL_CONTEXT_MAX_BYTES) {
    return {
      ok: false,
      bytes,
      error: `lead_dial_context_json exceeds ${LEAD_DIAL_CONTEXT_MAX_BYTES} bytes`
    };
  }
  return { ok: true, bytes };
}
