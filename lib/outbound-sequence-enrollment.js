import { phoneMatchKey as defaultPhoneMatchKey } from './lead-phone-key.js';
import {
  isLeadExplicitlyOptedIntoOutboundSequence,
  mergeOutboundSequenceEnrollmentIntoDialContext,
  validateLeadDialContextSize,
} from './lead-dial-context.js';
import { getValidatedOutboundSequence } from './outbound-sequence.js';
import { stopOutboundSequenceForLead } from './outbound-sequence-ops.js';

/**
 * Set per-lead multi-call (outbound sequence) enrollment via `lead_dial_context_json`.
 * Opt-out also stops an active sequence when sequence state exists.
 */
export async function setLeadOutboundSequenceEnrollment({
  clientKey,
  leadPhone,
  enrolled,
  actor = 'operator',
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
}) {
  const phone = String(leadPhone || '').trim();
  const wantEnrolled = enrolled === true || enrolled === 'true' || enrolled === 1 || enrolled === '1';
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
  };
}
