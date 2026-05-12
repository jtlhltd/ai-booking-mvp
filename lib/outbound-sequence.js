/**
 * Outbound multi-stage sequence engine (pure helpers + validation).
 * Dialing always goes through call_queue → instant-calling; this module never POSTs to Vapi.
 */

import { scheduleAtOptimalCallWindow } from './optimal-call-window.js';
import { isLeadExplicitlyOptedIntoOutboundSequence } from './lead-dial-context.js';

const ENV_DISABLE = 'OUTBOUND_SEQUENCE_DISABLED';
const ISO_DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_HANDOFF_IMPORT_CONTEXT_KEYS = 16;

export const DEFAULT_HANDOFF_IMPORT_CONTEXT_KEYS = Object.freeze(['crmCampaign', 'laneHint']);

function isIsoDateOnly(raw) {
  if (typeof raw !== 'string') return false;
  const trimmed = raw.trim();
  if (!ISO_DATE_ONLY_RE.test(trimmed)) return false;
  const dt = new Date(`${trimmed}T00:00:00.000Z`);
  return Number.isFinite(dt.getTime()) && dt.toISOString().startsWith(`${trimmed}T`);
}

function normalizeConfiguredStringArray(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

/** @returns {boolean} */
export function isOutboundSequenceGloballyDisabled() {
  const v = String(process.env[ENV_DISABLE] ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/**
 * @param {unknown} raw
 * @returns {{ ok: true, config: object } | { ok: false, errors: string[] }}
 */
export function validateOutboundSequenceConfig(raw) {
  const errors = [];
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['outbound_sequence_json must be a non-null object'] };
  }
  const cfg = /** @type {Record<string, unknown>} */ (raw);
  if (cfg.enabled !== true && cfg.enabled !== false && cfg.enabled != null) {
    errors.push('enabled must be a boolean when present');
  }
  if (cfg.enabled !== true) {
    if (errors.length) return { ok: false, errors };
    return { ok: true, config: cfg };
  }

  const maxTotal = cfg.maxTotalDialsPerLead;
  if (maxTotal != null && (!Number.isFinite(Number(maxTotal)) || Number(maxTotal) < 1)) {
    errors.push('maxTotalDialsPerLead must be a positive number when set');
  }
  const maxDays = cfg.maxSequenceDurationDays;
  if (maxDays != null && (!Number.isFinite(Number(maxDays)) || Number(maxDays) < 1)) {
    errors.push('maxSequenceDurationDays must be a positive number when set');
  }
  if (cfg.handoffImportContextKeys != null) {
    if (!Array.isArray(cfg.handoffImportContextKeys)) {
      errors.push('handoffImportContextKeys must be a string array when set');
    } else {
      const normalizedKeys = normalizeConfiguredStringArray(cfg.handoffImportContextKeys);
      if (normalizedKeys.length !== cfg.handoffImportContextKeys.length) {
        errors.push('handoffImportContextKeys entries must be non-empty strings');
      }
      if (normalizedKeys.length > MAX_HANDOFF_IMPORT_CONTEXT_KEYS) {
        errors.push(`handoffImportContextKeys must contain at most ${MAX_HANDOFF_IMPORT_CONTEXT_KEYS} entries`);
      }
    }
  }
  if (cfg.classicFollowUpCutoverDate != null && !isIsoDateOnly(cfg.classicFollowUpCutoverDate)) {
    errors.push('classicFollowUpCutoverDate must be YYYY-MM-DD when set');
  }
  const stages = cfg.stages;
  if (!Array.isArray(stages) || stages.length === 0) {
    errors.push('stages must be a non-empty array');
    return { ok: false, errors };
  }
  const ids = new Set();
  for (let i = 0; i < stages.length; i++) {
    const s = stages[i];
    if (!s || typeof s !== 'object') {
      errors.push(`stages[${i}] must be an object`);
      continue;
    }
    const st = /** @type {Record<string, unknown>} */ (s);
    const id = st.id;
    if (typeof id !== 'string' || !id.trim()) {
      errors.push(`stages[${i}].id must be a non-empty string`);
    } else if (ids.has(id)) {
      errors.push(`duplicate stage id: ${id}`);
    } else {
      ids.add(id);
    }
    if (typeof st.firstMessage !== 'string' || !String(st.firstMessage).trim()) {
      errors.push(`stages[${i}].firstMessage is required`);
    }
    if (typeof st.systemMessage !== 'string' || !String(st.systemMessage).trim()) {
      errors.push(`stages[${i}].systemMessage is required`);
    }
    const req = st.requiredFields;
    if (!Array.isArray(req) || req.length === 0 || !req.every((f) => typeof f === 'string' && f.trim())) {
      errors.push(`stages[${i}].requiredFields must be a non-empty string array`);
    }
    const maxA = st.maxAttemptsInStage;
    if (!Number.isFinite(Number(maxA)) || Number(maxA) < 1) {
      errors.push(`stages[${i}].maxAttemptsInStage must be a positive integer`);
    }
    const isFinal = st.isFinal === true;
    const nextStage = st.nextStage;
    if (!isFinal && (typeof nextStage !== 'string' || !String(nextStage).trim())) {
      errors.push(`stages[${i}].nextStage is required unless isFinal is true`);
    }
    if (isFinal && nextStage != null && String(nextStage).trim() !== '') {
      errors.push(`stages[${i}].isFinal stages must not set nextStage`);
    }
    const sched = st.scheduling;
    if (sched != null && typeof sched !== 'object') {
      errors.push(`stages[${i}].scheduling must be an object when set`);
    } else if (sched && typeof sched === 'object') {
      const minD = /** @type {Record<string, unknown>} */ (sched).minDelayMinutesBeforeNext;
      const maxD = /** @type {Record<string, unknown>} */ (sched).maxDelayMinutesBeforeNext;
      if (minD != null && (!Number.isFinite(Number(minD)) || Number(minD) < 0)) {
        errors.push(`stages[${i}].scheduling.minDelayMinutesBeforeNext invalid`);
      }
      if (maxD != null && (!Number.isFinite(Number(maxD)) || Number(maxD) < 0)) {
        errors.push(`stages[${i}].scheduling.maxDelayMinutesBeforeNext invalid`);
      }
      if (
        minD != null &&
        maxD != null &&
        Number.isFinite(Number(minD)) &&
        Number.isFinite(Number(maxD)) &&
        Number(maxD) < Number(minD)
      ) {
        errors.push(`stages[${i}].scheduling: maxDelayMinutesBeforeNext must be >= minDelayMinutesBeforeNext`);
      }
    }
  }
  const last = /** @type {Record<string, unknown>} */ (stages[stages.length - 1]);
  if (last.isFinal !== true) {
    errors.push('last stage must have isFinal: true');
  }
  for (let i = 0; i < stages.length; i++) {
    const st = /** @type {Record<string, unknown>} */ (stages[i]);
    const ns = st.nextStage;
    if (typeof ns === 'string' && ns.trim() && !ids.has(ns)) {
      errors.push(`stages[${i}].nextStage references unknown stage: ${ns}`);
    }
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, config: cfg };
}

/**
 * @param {object|null|undefined} client mapTenantRow output
 * @returns {object|null} validated sequence config or null if disabled / invalid / global kill switch
 */
export function getValidatedOutboundSequence(client) {
  if (!client || isOutboundSequenceGloballyDisabled()) return null;
  const raw = client.outboundSequence;
  if (!raw || typeof raw !== 'object' || raw.enabled !== true) return null;
  const v = validateOutboundSequenceConfig(raw);
  if (!v.ok) return null;
  return v.config;
}

/**
 * Lead enrollment is explicit: tenant config can allow sequence, but each lead
 * must opt in separately via lead_dial_context_json.
 * @param {object|null|undefined} client
 * @param {unknown} leadDialContextRaw
 * @returns {boolean}
 */
export function shouldLeadUseOutboundSequence(client, leadDialContextRaw) {
  return !!getValidatedOutboundSequence(client) && isLeadExplicitlyOptedIntoOutboundSequence(leadDialContextRaw);
}

/**
 * Ordered allow-list for `qual._importContext` on sequence handoff rows.
 * Accepts either a validated outbound-sequence config object or a client row.
 * @param {object|null|undefined} clientOrConfig
 * @returns {string[]}
 */
export function getHandoffImportContextKeys(clientOrConfig) {
  const cfg =
    clientOrConfig && typeof clientOrConfig === 'object' && Array.isArray(clientOrConfig.stages)
      ? clientOrConfig
      : getValidatedOutboundSequence(clientOrConfig);
  const normalized = normalizeConfiguredStringArray(cfg?.handoffImportContextKeys);
  if (normalized.length > 0) {
    return normalized.slice(0, MAX_HANDOFF_IMPORT_CONTEXT_KEYS);
  }
  return [...DEFAULT_HANDOFF_IMPORT_CONTEXT_KEYS];
}

/**
 * Optional cutover date used by dashboard cohort filters.
 * Accepts either a validated outbound-sequence config object or a client row.
 * @param {object|null|undefined} clientOrConfig
 * @returns {string|null}
 */
export function getClassicFollowUpCutoverDate(clientOrConfig) {
  let cfg = null;
  if (clientOrConfig && typeof clientOrConfig === 'object' && Array.isArray(clientOrConfig.stages)) {
    cfg = clientOrConfig;
  } else if (clientOrConfig && typeof clientOrConfig === 'object') {
    const raw = clientOrConfig.outboundSequence;
    if (raw && typeof raw === 'object') {
      const validated = validateOutboundSequenceConfig(raw);
      cfg = validated.ok ? validated.config : null;
    }
  }
  const cutover = cfg?.classicFollowUpCutoverDate;
  return typeof cutover === 'string' && cutover.trim() ? cutover.trim() : null;
}

/**
 * @param {object} client
 * @returns {object|null}
 */
export function getFirstStage(client) {
  const cfg = getValidatedOutboundSequence(client);
  const stages = cfg?.stages;
  if (!Array.isArray(stages) || !stages[0]) return null;
  return /** @type {object} */ (stages[0]);
}

/**
 * @param {object} client
 * @param {string} stageId
 * @returns {object|null}
 */
export function getStageById(client, stageId) {
  const cfg = getValidatedOutboundSequence(client);
  if (!cfg?.stages || !stageId) return null;
  const sid = String(stageId).trim();
  for (const s of cfg.stages) {
    if (s && typeof s === 'object' && String(/** @type {any} */ (s).id) === sid) {
      return /** @type {object} */ (s);
    }
  }
  return null;
}

/**
 * @param {object} stage
 * @param {Record<string, unknown>} structuredData
 */
export function isStageComplete(stage, structuredData) {
  const req = /** @type {any} */ (stage).requiredFields;
  if (!Array.isArray(req) || !structuredData || typeof structuredData !== 'object') return false;
  for (const field of req) {
    const v = structuredData[field];
    if (v == null) return false;
    if (typeof v === 'string' && !v.trim()) return false;
    if (typeof v === 'boolean') continue;
    if (typeof v === 'number' && !Number.isFinite(v)) return false;
  }
  return true;
}

/**
 * @param {object} client
 * @param {string} currentStageId
 * @param {Record<string, unknown>} structuredData
 * @returns {{ nextStageId: string | null, isFinal: boolean }}
 */
export function pickNextStage(client, currentStageId, structuredData) {
  const stage = getStageById(client, currentStageId);
  if (!stage || !isStageComplete(stage, structuredData)) {
    return { nextStageId: null, isFinal: false };
  }
  if (/** @type {any} */ (stage).isFinal === true) {
    return { nextStageId: null, isFinal: true };
  }
  const next = /** @type {any} */ (stage).nextStage;
  if (typeof next !== 'string' || !next.trim()) return { nextStageId: null, isFinal: false };
  return { nextStageId: next.trim(), isFinal: false };
}

/**
 * Flatten prior stage snapshots into one object for variable substitution.
 * @param {Array<{ structuredData?: Record<string, unknown> }>} stagesCompleted
 */
export function mergeStructuredFromCompletedStages(stagesCompleted) {
  const out = {};
  if (!Array.isArray(stagesCompleted)) return out;
  for (const snap of stagesCompleted) {
    const sd = snap?.structuredData;
    if (sd && typeof sd === 'object') Object.assign(out, sd);
  }
  return out;
}

/**
 * @param {object} stage stage config
 * @param {object} lead { name?, phone?, ... }
 * @param {object} client mapTenantRow
 * @param {{
 *   stagesCompleted?: Array<{ stageId?: string, structuredData?: Record<string, unknown>, completedAt?: string }>,
 *   currentStructured?: Record<string, unknown>,
 *   lastCallCompletedAt?: string | Date | null,
 *   isFinalStage?: boolean
 * }} ctx
 * @returns {Record<string, unknown>}
 */
export function buildAssistantOverridesForStage(stage, lead, client, ctx = {}) {
  const st = /** @type {any} */ (stage);
  const prior = mergeStructuredFromCompletedStages(ctx.stagesCompleted || []);
  const cur = ctx.currentStructured && typeof ctx.currentStructured === 'object' ? ctx.currentStructured : {};
  const merged = { ...prior, ...cur };

  const leadName =
    (lead && (lead.name || lead.businessName)) ||
    merged.businessName ||
    merged.BusinessName ||
    '';
  const tenantBusinessName = client?.displayName || client?.name || '';

  let daysSinceLastCall = 0;
  if (ctx.lastCallCompletedAt) {
    const t = ctx.lastCallCompletedAt instanceof Date ? ctx.lastCallCompletedAt : new Date(ctx.lastCallCompletedAt);
    if (!Number.isNaN(t.getTime())) {
      daysSinceLastCall = Math.max(0, Math.floor((Date.now() - t.getTime()) / (24 * 60 * 60 * 1000)));
    }
  }

  const priorSubstantive =
    merged.priorCallWasSubstantive === true ||
    merged.priorCallWasSubstantive === 'true' ||
    merged.priorCallWasSubstantive === 'TRUE';

  const variableValues = {
    ...merged,
    leadName: String(leadName || '').trim() || 'there',
    tenantBusinessName,
    decisionMakerName: merged.decisionMakerName || merged.decision_maker || '',
    decisionMakerRole: merged.decisionMakerRole || '',
    bestCallbackWindow: merged.bestCallbackWindow || merged.callbackWindow || '',
    priorCallWasSubstantive: priorSubstantive,
    daysSinceLastCall,
    isFollowUpCall: (ctx.stagesCompleted || []).length > 0,
    isFinalStage: ctx.isFinalStage === true
  };

  const overrides = {
    firstMessage: st.firstMessage,
    variableValues,
    maxDurationSeconds:
      st.maxDurationSeconds != null && Number.isFinite(Number(st.maxDurationSeconds))
        ? Number(st.maxDurationSeconds)
        : undefined
  };

  const sys = st.systemMessage != null ? String(st.systemMessage).trim() : '';
  if (sys) {
    overrides.model = {
      provider: 'openai',
      model: 'gpt-4o',
      temperature: 0.3,
      maxTokens: 500,
      messages: [{ role: 'system', content: sys }]
    };
  }

  return overrides;
}

/**
 * @param {object} stage
 * @param {Record<string, unknown>} structuredData
 * @param {Date} baselineHint baseline after min inter-stage delay
 * @param {{ tenant: object, routing?: object|null, fallbackTz?: string, clientKey?: string, jitterKey?: string }} opts
 * @returns {Promise<Date>}
 */
export async function computeNextStageScheduledFor(stage, structuredData, baselineHint, opts) {
  const tenant = opts.tenant;
  const routing = opts.routing ?? null;
  const fallbackTz = opts.fallbackTz || process.env.TZ || 'Europe/London';
  const clientKey = opts.clientKey;
  const jitterKey = opts.jitterKey || clientKey || 'sequence';

  const sched = /** @type {any} */ (stage).scheduling || {};
  const minM = Number(sched.minDelayMinutesBeforeNext);
  const maxM = Number(sched.maxDelayMinutesBeforeNext);
  const minMs = Number.isFinite(minM) && minM >= 0 ? minM * 60 * 1000 : 60 * 60 * 1000;
  const maxMs = Number.isFinite(maxM) && maxM >= minM ? maxM * 60 * 1000 : minMs + 60 * 60 * 1000;
  const span = Math.max(0, maxMs - minMs);
  const jitter = minMs + (span > 0 ? Math.floor(Math.random() * (span + 1)) : 0);

  const base = baselineHint instanceof Date ? baselineHint : new Date(baselineHint);
  const delayed = new Date(Math.max(Date.now(), base.getTime()) + jitter);

  const honorField = sched.honorCallbackWindowField;
  if (typeof honorField === 'string' && honorField.trim() && structuredData && typeof structuredData === 'object') {
    const raw = structuredData[honorField.trim()];
    if (raw != null && String(raw).trim()) {
      // v1: field captured for humans; scheduling still uses delayed baseline (Tom uses null honor field).
    }
  }

  let scheduled = await scheduleAtOptimalCallWindow(tenant, routing, delayed, {
    fallbackTz,
    clientKey,
    jitterKey: `${jitterKey}:seq_next`
  });

  const now = Date.now();
  if (!scheduled || scheduled.getTime() <= now) {
    scheduled = await scheduleAtOptimalCallWindow(tenant, routing, new Date(now + 60_000), {
      fallbackTz,
      clientKey,
      jitterKey: `${jitterKey}:seq_next_bump`
    });
  }
  if (scheduled.getTime() <= now) {
    scheduled = new Date(now + 120_000);
  }
  return scheduled;
}
