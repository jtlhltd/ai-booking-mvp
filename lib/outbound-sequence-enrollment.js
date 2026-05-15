import { phoneMatchKey as defaultPhoneMatchKey } from './lead-phone-key.js';
import {
  isLeadExplicitlyOptedIntoOutboundSequence,
  mergeOutboundSequenceEnrollmentIntoDialContext,
  validateLeadDialContextSize,
} from './lead-dial-context.js';
import { getValidatedOutboundSequence } from './outbound-sequence.js';
import { stopOutboundSequenceForLead } from './outbound-sequence-ops.js';

export const MAX_OUTBOUND_SEQUENCE_ENROLLMENT_BULK = 100;

function parseWantEnrolled(enrolled) {
  return enrolled === true || enrolled === 'true' || enrolled === 1 || enrolled === '1';
}

function uniqueLeadPhones(leadPhones, maxItems = MAX_OUTBOUND_SEQUENCE_ENROLLMENT_BULK) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(leadPhones) ? leadPhones : []) {
    const phone = String(raw || '').trim();
    if (!phone || seen.has(phone)) continue;
    seen.add(phone);
    out.push(phone);
    if (out.length >= maxItems) break;
  }
  return out;
}

/**
 * Set per-lead multi-call (outbound sequence) enrollment via `lead_dial_context_json`.
 * Opt-out also stops an active sequence when sequence state exists.
 */
export async function setLeadOutboundSequenceEnrollment({
  clientKey,
  leadPhone,
  enrolled,
  actor = 'operator',
  queueNow = false,
  query,
  getFullClient,
  phoneMatchKey = defaultPhoneMatchKey,
  isPostgres = false,
  getLeadSequenceState,
  updateLeadSequenceState,
  getCallQueueByPhone,
  updateCallQueueStatus,
  getLeadHandoffByPhone,
  upsertLeadHandoff,
  addToCallQueue,
  insertLeadSequenceState,
  getNextBusinessHour,
  isBusinessHours,
  getCallTimeBanditState,
  timezone,
}) {
  const phone = String(leadPhone || '').trim();
  const wantEnrolled = parseWantEnrolled(enrolled);
  if (!clientKey || !phone) return { ok: false, error: 'missing_client_or_phone' };
  if (typeof query !== 'function') return { ok: false, error: 'missing_query' };

  const mk = phoneMatchKey(phone);
  if (!mk) return { ok: false, error: 'invalid_phone' };

  const leadRes = await query(
    `
    SELECT id, phone, lead_dial_context_json AS "leadDialContextJson"
    FROM leads
    WHERE client_key = $1 AND phone_match_key = $2
    ORDER BY created_at DESC
    LIMIT 1
  `,
    [clientKey, mk]
  ).catch(() => ({ rows: [] }));
  const lead = leadRes?.rows?.[0];
  if (!lead) return { ok: false, error: 'lead_not_found' };

  if (wantEnrolled) {
    const client = typeof getFullClient === 'function' ? await getFullClient(clientKey) : null;
    if (!getValidatedOutboundSequence(client)) {
      return { ok: false, error: 'tenant_sequence_disabled' };
    }
  }

  const nextContext = mergeOutboundSequenceEnrollmentIntoDialContext(lead.leadDialContextJson, {
    enrolled: wantEnrolled,
    actor,
  });
  const sizeCheck = validateLeadDialContextSize(nextContext);
  if (!sizeCheck.ok) {
    return { ok: false, error: sizeCheck.error || 'lead_dial_context_too_large' };
  }

  const contextJson = JSON.stringify(nextContext);
  const updateSql = isPostgres
    ? `UPDATE leads
       SET lead_dial_context_json = $3::jsonb
       WHERE client_key = $1 AND phone_match_key = $2
       RETURNING id, phone, lead_dial_context_json AS "leadDialContextJson"`
    : `UPDATE leads
       SET lead_dial_context_json = $3
       WHERE client_key = $1 AND phone_match_key = $2
       RETURNING id, phone, lead_dial_context_json AS "leadDialContextJson"`;
  const updated = await query(updateSql, [clientKey, mk, contextJson]).catch(() => ({ rows: [] }));
  const row = updated?.rows?.[0];
  if (!row) return { ok: false, error: 'update_failed' };

  let queuedFirstStage = false;
  if (wantEnrolled && queueNow) {
    const client = typeof getFullClient === 'function' ? await getFullClient(clientKey) : null;
    const db = await import('../db.js');
    const { queueFirstSequenceStageForLead } = await import('./outbound-sequence-queue-first.js');
    const queueOut = await queueFirstSequenceStageForLead({
      clientKey,
      lead: { ...row, phone: row.phone || phone },
      client,
      actor,
      addToCallQueue: addToCallQueue || db.addToCallQueue,
      insertLeadSequenceState: insertLeadSequenceState || db.insertLeadSequenceState,
      getLeadSequenceState,
      getNextBusinessHour: getNextBusinessHour || db.getNextBusinessHour,
      isBusinessHours,
      getCallTimeBanditState: getCallTimeBanditState || db.getCallTimeBanditState,
      timezone,
    });
    queuedFirstStage = !!queueOut?.ok;
  }

  let stoppedActiveSequence = false;
  if (!wantEnrolled && typeof getLeadSequenceState === 'function') {
    const state = await getLeadSequenceState(clientKey, phone).catch(() => null);
    if (state && String(state.status || '').toLowerCase() === 'active') {
      const stopOut = await stopOutboundSequenceForLead({
        clientKey,
        leadPhone: phone,
        actor: String(actor || 'operator').trim() || 'operator',
        getLeadSequenceState,
        updateLeadSequenceState,
        getCallQueueByPhone,
        updateCallQueueStatus,
        getLeadHandoffByPhone,
        upsertLeadHandoff,
      });
      stoppedActiveSequence = !!stopOut?.ok;
    }
  }

  return {
    ok: true,
    clientKey,
    leadPhone: row.phone || phone,
    leadId: row.id != null ? String(row.id) : null,
    enrolled: wantEnrolled,
    sequenceOptedIn: isLeadExplicitlyOptedIntoOutboundSequence(row.leadDialContextJson),
    stoppedActiveSequence,
    queuedFirstStage,
  };
}

/**
 * Bulk variant of {@link setLeadOutboundSequenceEnrollment}.
 * @param {object} params
 * @param {string} params.clientKey
 * @param {string[]} params.leadPhones
 * @param {boolean|string|number} params.enrolled
 * @param {number} [params.maxItems]
 */
export async function setLeadsOutboundSequenceEnrollmentBulk({
  clientKey,
  leadPhones,
  enrolled,
  actor = 'operator',
  queueNow = false,
  maxItems = MAX_OUTBOUND_SEQUENCE_ENROLLMENT_BULK,
  query,
  getFullClient,
  phoneMatchKey,
  isPostgres,
  getLeadSequenceState,
  updateLeadSequenceState,
  getCallQueueByPhone,
  updateCallQueueStatus,
  getLeadHandoffByPhone,
  upsertLeadHandoff,
  addToCallQueue,
  insertLeadSequenceState,
  getNextBusinessHour,
  isBusinessHours,
  getCallTimeBanditState,
  timezone,
}) {
  const phones = uniqueLeadPhones(leadPhones, maxItems);
  if (!clientKey) return { ok: false, error: 'missing_client_key' };
  if (!phones.length) return { ok: false, error: 'no_lead_phones' };

  const wantEnrolled = parseWantEnrolled(enrolled);
  if (wantEnrolled) {
    const client = typeof getFullClient === 'function' ? await getFullClient(clientKey) : null;
    if (!getValidatedOutboundSequence(client)) {
      return { ok: false, error: 'tenant_sequence_disabled' };
    }
  }

  const shared = {
    query,
    getFullClient,
    phoneMatchKey,
    isPostgres,
    getLeadSequenceState,
    updateLeadSequenceState,
    getCallQueueByPhone,
    updateCallQueueStatus,
    getLeadHandoffByPhone,
    upsertLeadHandoff,
    addToCallQueue,
    insertLeadSequenceState,
    getNextBusinessHour,
    isBusinessHours,
    getCallTimeBanditState,
    timezone,
  };

  const results = [];
  for (const leadPhone of phones) {
    const out = await setLeadOutboundSequenceEnrollment({
      clientKey,
      leadPhone,
      enrolled: wantEnrolled,
      actor,
      queueNow: wantEnrolled && queueNow,
      ...shared,
    });
    results.push({
      leadPhone,
      ok: !!out.ok,
      error: out.ok ? null : out.error || 'unknown',
      sequenceOptedIn: out.sequenceOptedIn === true,
      stoppedActiveSequence: out.stoppedActiveSequence === true,
      queuedFirstStage: out.queuedFirstStage === true,
    });
  }

  const updated = results.filter((r) => r.ok).length;
  const failed = results.length - updated;
  return {
    ok: updated > 0,
    partial: failed > 0 && updated > 0,
    clientKey,
    enrolled: wantEnrolled,
    requested: phones.length,
    updated,
    failed,
    results,
  };
}
