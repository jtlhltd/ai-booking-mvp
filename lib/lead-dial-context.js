/**
 * Per-lead JSON stored in `leads.lead_dial_context_json` for optional
 * `assistantOverrides.variableValues` plus bounded PR5 message overrides.
 * Sequence / worker code sets authoritative keys (leadName,
 * tenantBusinessName, …); imported context must not override them.
 */

/** Max UTF-8 byte length of serialized JSON after reserved-key stripping (writers should enforce). */
export const LEAD_DIAL_CONTEXT_MAX_BYTES = 24 * 1024;
export const LEAD_DIAL_CONTEXT_MESSAGE_MAX_CHARS = 1000;
export const LEAD_DIAL_CONTEXT_MESSAGE_KEYS = new Set(['firstMessage', 'systemMessage']);
export const LEAD_OUTBOUND_SEQUENCE_OPT_IN_KEYS = Object.freeze([
  'outboundSequenceOptIn',
  'sequenceOptIn',
  'multiCallOptIn',
  'multiStageOptIn'
]);
export const LEAD_DIAL_CONTEXT_NON_VARIABLE_KEYS = new Set([
  'variableValues',
  ...LEAD_DIAL_CONTEXT_MESSAGE_KEYS
]);

function isTruthyOptInValue(value) {
  if (value === true) return true;
  if (typeof value === 'number') return Number.isFinite(value) && value === 1;
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return ['1', 'true', 'yes', 'y', 'on', 'sequence'].includes(normalized);
}

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
 * Top-level import payload keys that describe the lead row itself rather than
 * CRM/sequence hints we want to persist into `lead_dial_context_json`.
 * @type {ReadonlySet<string>}
 */
export const IMPORT_LEAD_DIAL_CONTEXT_ROW_KEYS = new Set([
  'name',
  'phone',
  'email',
  'service',
  'source',
  'notes',
  'status',
  'tags',
  'importedAt',
  'rowNumber',
  'leadScore',
  'phoneType',
  'created_at',
  'createdAt',
  'customFields',
  'leadDialContext',
  'dialContext'
]);

function parseLeadDialContextObject(raw) {
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
  return parsed;
}

function getLeadDialVariableSource(parsed) {
  const out = {};
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return out;

  for (const [key, value] of Object.entries(parsed)) {
    if (LEAD_DIAL_CONTEXT_NON_VARIABLE_KEYS.has(key)) continue;
    out[key] = value;
  }

  const nested =
    parsed.variableValues && typeof parsed.variableValues === 'object' && !Array.isArray(parsed.variableValues)
      ? /** @type {Record<string, unknown>} */ (parsed.variableValues)
      : null;
  if (nested) {
    Object.assign(out, nested);
  }

  return out;
}

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

export function sanitizeLeadDialContextMessage(input, maxChars = LEAD_DIAL_CONTEXT_MESSAGE_MAX_CHARS) {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (!Number.isFinite(Number(maxChars)) || Number(maxChars) <= 0) {
    return trimmed;
  }
  return trimmed.slice(0, Math.max(1, Math.floor(Number(maxChars))));
}

/**
 * @param {unknown} raw DB value: JSONB object, stringified JSON (SQLite), or null
 * @returns {Record<string, unknown>}
 */
export function parseLeadDialContextFromDb(raw) {
  return normalizeLeadDialContext(raw);
}

/**
 * Parse a lead dial context row into a bounded L2 envelope. Backward-compatible
 * flat PR4 rows still produce `variableValues`; explicit `firstMessage` and
 * `systemMessage` survive only at the top level.
 * @param {unknown} raw
 * @param {{ maxBytes?: number, messageMaxChars?: number }} [options]
 * @returns {{ variableValues: Record<string, string | number | boolean | null>, firstMessage?: string, systemMessage?: string }}
 */
export function normalizeLeadDialContextEnvelope(raw, options = {}) {
  const parsed = parseLeadDialContextObject(raw);
  const variableValues = filterLeadDialContextToScalars(
    stripReservedLeadDialContextKeys(getLeadDialVariableSource(parsed))
  );
  const firstMessage = sanitizeLeadDialContextMessage(
    parsed.firstMessage,
    options.messageMaxChars
  );
  const systemMessage = sanitizeLeadDialContextMessage(
    parsed.systemMessage,
    options.messageMaxChars
  );

  const envelope = {};
  if (Object.keys(variableValues).length > 0) envelope.variableValues = variableValues;
  if (firstMessage) envelope.firstMessage = firstMessage;
  if (systemMessage) envelope.systemMessage = systemMessage;

  if (!validateLeadDialContextSize(envelope, options.maxBytes).ok) {
    return { variableValues: {} };
  }

  return {
    variableValues,
    ...(firstMessage ? { firstMessage } : {}),
    ...(systemMessage ? { systemMessage } : {})
  };
}

/**
 * Convert a normalized lead dial context envelope into the storable DB shape.
 * Legacy rows stay flat when only `variableValues` are present.
 * @param {{ variableValues?: Record<string, string | number | boolean | null>, firstMessage?: string, systemMessage?: string }} envelope
 * @param {{ preferEnvelope?: boolean, maxBytes?: number, messageMaxChars?: number }} [options]
 * @returns {Record<string, unknown>}
 */
export function serializeLeadDialContextEnvelope(envelope, options = {}) {
  const normalized = normalizeLeadDialContextEnvelope(envelope, options);
  const variableValues =
    normalized.variableValues && typeof normalized.variableValues === 'object'
      ? normalized.variableValues
      : {};
  const hasMessages = !!(normalized.firstMessage || normalized.systemMessage);

  if (!options.preferEnvelope && !hasMessages) {
    return variableValues;
  }

  const out = {};
  if (Object.keys(variableValues).length > 0) out.variableValues = variableValues;
  if (normalized.firstMessage) out.firstMessage = normalized.firstMessage;
  if (normalized.systemMessage) out.systemMessage = normalized.systemMessage;
  return out;
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
  return normalizeLeadDialContextEnvelope(raw, options).variableValues;
}

/**
 * Explicit per-lead sequence opt-in. Tenant-level sequence enablement alone is
 * not enough to enroll the lead.
 * @param {unknown} raw
 * @returns {boolean}
 */
export function isLeadExplicitlyOptedIntoOutboundSequence(raw) {
  const variableValues = normalizeLeadDialContextEnvelope(raw).variableValues || {};
  for (const key of LEAD_OUTBOUND_SEQUENCE_OPT_IN_KEYS) {
    if (isTruthyOptInValue(variableValues[key])) return true;
  }
  return isTruthyOptInValue(variableValues.outboundDialMode);
}

/**
 * Best-effort accessor for lead-context payloads across raw API/import objects
 * and DB rows.
 * @param {unknown} lead
 * @returns {unknown}
 */
export function getLeadDialContextRawFromLeadLike(lead) {
  if (!lead || typeof lead !== 'object' || Array.isArray(lead)) return null;
  const row = /** @type {Record<string, unknown>} */ (lead);
  return row.lead_dial_context_json ?? row.leadDialContext ?? row.dialContext ?? row.customFields ?? null;
}

/**
 * Extract a sanitized dial-context object from an import/API lead payload.
 * Explicit objects (`leadDialContext`, `dialContext`, `customFields`) win.
 * Otherwise, scalar extra top-level fields are treated as variableValue hints.
 * @param {unknown} rawLead
 * @param {{ maxBytes?: number }} [options]
 * @returns {Record<string, unknown>}
 */
export function extractLeadDialContextFromImportLead(rawLead, options = {}) {
  if (!rawLead || typeof rawLead !== 'object' || Array.isArray(rawLead)) return {};
  const lead = /** @type {Record<string, unknown>} */ (rawLead);
  for (const key of ['leadDialContext', 'dialContext', 'customFields']) {
    const candidate = lead[key];
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
      const parsedCandidate = parseLeadDialContextObject(candidate);
      const preferEnvelope =
        Object.prototype.hasOwnProperty.call(parsedCandidate, 'variableValues') ||
        Object.prototype.hasOwnProperty.call(parsedCandidate, 'firstMessage') ||
        Object.prototype.hasOwnProperty.call(parsedCandidate, 'systemMessage');
      if (preferEnvelope) {
        return serializeLeadDialContextEnvelope(parsedCandidate, { ...options, preferEnvelope: true });
      }
      return normalizeLeadDialContext(parsedCandidate, options);
    }
  }
  const extras = {};
  for (const [key, value] of Object.entries(lead)) {
    if (IMPORT_LEAD_DIAL_CONTEXT_ROW_KEYS.has(key)) continue;
    extras[key] = value;
  }
  return normalizeLeadDialContext(extras, options);
}
