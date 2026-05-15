import { getLeadDialContextRawFromLeadLike } from './lead-dial-context.js';
import {
  getFirstStage,
  getValidatedOutboundSequence,
  shouldLeadUseOutboundSequence,
} from './outbound-sequence.js';
import { scheduleAtOptimalCallWindow } from './optimal-call-window.js';

/**
 * Enqueue the first sequence stage for an opted-in lead (operator-initiated).
 * Does not bypass business-hours scheduling.
 */
export async function queueFirstSequenceStageForLead({
  clientKey,
  lead,
  client,
  actor = 'operator',
  addToCallQueue,
  insertLeadSequenceState,
  getLeadSequenceState,
  getNextBusinessHour,
  isBusinessHours,
  getCallTimeBanditState,
  timezone = 'Europe/London',
}) {
  const phone = String(lead?.phone || '').trim();
  if (!clientKey || !phone) return { ok: false, error: 'missing_fields' };
  if (!getValidatedOutboundSequence(client)) return { ok: false, error: 'tenant_sequence_disabled' };
  if (!shouldLeadUseOutboundSequence(client, getLeadDialContextRawFromLeadLike(lead))) {
    return { ok: false, error: 'lead_not_opted_in' };
  }
  if (typeof addToCallQueue !== 'function') return { ok: false, error: 'missing_add_to_call_queue' };

  const firstStage = getFirstStage(client);
  const stageId = firstStage?.id ? String(firstStage.id) : '';
  if (!stageId) return { ok: false, error: 'no_first_stage' };

  let sequenceRow = null;
  if (typeof getLeadSequenceState === 'function') {
    sequenceRow = await getLeadSequenceState(clientKey, phone).catch(() => null);
  }
  const seqStatus = String(sequenceRow?.status || '').trim().toLowerCase();
  if (seqStatus === 'active' && typeof insertLeadSequenceState === 'function') {
    // already active — still allow queue if no pending dial (caller may want a nudge)
  } else if (typeof insertLeadSequenceState === 'function') {
    await insertLeadSequenceState({
      clientKey,
      leadPhone: phone,
      currentStageId: stageId,
    }).catch((err) => {
      console.warn('[SEQUENCE QUEUE FIRST] insertLeadSequenceState skipped:', err?.message || err);
    });
  }

  const inHours = typeof isBusinessHours === 'function' ? isBusinessHours(client) : true;
  const baseline = inHours ? new Date() : (typeof getNextBusinessHour === 'function' ? getNextBusinessHour(client) : new Date());
  const banditArms = typeof getCallTimeBanditState === 'function'
    ? await getCallTimeBanditState(clientKey).catch(() => ({}))
    : {};
  const scheduledFor = await scheduleAtOptimalCallWindow(client, null, baseline, {
    fallbackTz: timezone,
    clientKey,
    jitterKey: `enroll:${clientKey}:${lead?.id || phone}:${Date.now()}`,
    banditArms,
  });

  await addToCallQueue({
    clientKey,
    leadPhone: phone,
    priority: 8,
    scheduledFor,
    callType: 'vapi_call',
    callData: {
      triggerType: 'operator_sequence_enroll',
      outboundDialMode: 'sequence',
      stageId,
      leadId: lead?.id != null ? String(lead.id) : null,
      leadName: lead?.name || null,
      leadService: lead?.service || null,
      leadSource: lead?.source || null,
      actor: String(actor || 'operator').trim() || 'operator',
      businessHours: inHours ? 'within' : 'outside',
    },
  });

  return {
    ok: true,
    leadPhone: phone,
    stageId,
    scheduledFor: scheduledFor instanceof Date ? scheduledFor.toISOString() : String(scheduledFor || ''),
  };
}
