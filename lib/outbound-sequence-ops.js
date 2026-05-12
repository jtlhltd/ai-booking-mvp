import { SEQUENCE_ABANDONED_HANDOFF_SOURCE } from './dashboard-follow-up-filters.js';

export const MAX_SEQUENCE_OPS_AUDIT_ENTRIES = 32;
export const OPERATOR_SEQUENCE_STOP_SOURCE = 'operator.sequence_stopped';

function parseJsonObject(raw) {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(String(raw || ''));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function sanitizeOpsAuditEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const at = String(entry.at || '').trim();
  const actor = String(entry.actor || '').trim();
  const action = String(entry.action || '').trim();
  if (!at || !actor || !action) return null;
  return { at, actor, action };
}

export function appendSequenceOpsAudit(rawData, { actor = 'operator', action, at = new Date().toISOString() } = {}) {
  const data = parseJsonObject(rawData);
  const qual = data.qual && typeof data.qual === 'object' && !Array.isArray(data.qual) ? { ...data.qual } : {};
  const prior = Array.isArray(qual._opsAudit) ? qual._opsAudit.map(sanitizeOpsAuditEntry).filter(Boolean) : [];
  const nextEntry = sanitizeOpsAuditEntry({ at, actor, action });
  const nextAudit = nextEntry ? [...prior, nextEntry].slice(-MAX_SEQUENCE_OPS_AUDIT_ENTRIES) : prior.slice(-MAX_SEQUENCE_OPS_AUDIT_ENTRIES);
  return {
    ...data,
    qual: {
      ...qual,
      _opsAudit: nextAudit,
    },
  };
}

export function markSequenceSalvageDismissed(rawData, { actor = 'operator', at = new Date().toISOString() } = {}) {
  const withAudit = appendSequenceOpsAudit(rawData, { actor, action: 'salvage_dismiss', at });
  const qual = withAudit.qual && typeof withAudit.qual === 'object' && !Array.isArray(withAudit.qual) ? { ...withAudit.qual } : {};
  return {
    ...withAudit,
    qual: {
      ...qual,
      _salvageDismissedAt: at,
      _salvageDismissedBy: String(actor || 'operator').trim() || 'operator',
    },
  };
}

export function getSequenceOpsQual(rawData) {
  const data = parseJsonObject(rawData);
  return data.qual && typeof data.qual === 'object' && !Array.isArray(data.qual) ? data.qual : {};
}

async function upsertLeadHandoffAudit({
  clientKey,
  leadPhone,
  actor,
  action,
  source,
  summaryText,
  existing,
  upsertLeadHandoff,
  dataTransform,
}) {
  if (typeof upsertLeadHandoff !== 'function') return { ok: false, error: 'missing_upsert_handoff' };
  const current = existing || null;
  const nextData = typeof dataTransform === 'function'
    ? dataTransform(current?.dataJson || current?.data_json || {})
    : appendSequenceOpsAudit(current?.dataJson || current?.data_json || {}, { actor, action });
  await upsertLeadHandoff({
    clientKey,
    leadPhone,
    callId: current?.callId || current?.call_id || null,
    source: source || current?.source || OPERATOR_SEQUENCE_STOP_SOURCE,
    data: nextData,
    summaryText: summaryText || current?.summaryText || current?.summary_text || '',
    decisionMaker: current?.decisionMaker || current?.decision_maker || '',
    callbackWindow: current?.callbackWindow || current?.callback_window || '',
  });
  return { ok: true, data: nextData };
}

export async function stopOutboundSequenceForLead({
  clientKey,
  leadPhone,
  actor = 'operator',
  getLeadSequenceState,
  updateLeadSequenceState,
  getCallQueueByPhone,
  updateCallQueueStatus,
  getLeadHandoffByPhone,
  upsertLeadHandoff,
} = {}) {
  const phone = String(leadPhone || '').trim();
  const actorName = String(actor || 'operator').trim() || 'operator';
  if (!clientKey || !phone) return { ok: false, error: 'missing_fields' };
  if (typeof getLeadSequenceState !== 'function' || typeof updateLeadSequenceState !== 'function') {
    return { ok: false, error: 'missing_sequence_domain' };
  }
  const sequence = await getLeadSequenceState(clientKey, phone);
  if (!sequence) return { ok: false, error: 'sequence_not_found' };

  const queueRows = typeof getCallQueueByPhone === 'function' ? await getCallQueueByPhone(clientKey, phone, 100) : [];
  let cancelledQueueRows = 0;
  for (const row of queueRows || []) {
    const status = String(row?.status || '').trim().toLowerCase();
    const callType = String(row?.call_type || row?.callType || '').trim().toLowerCase();
    const callData = row?.call_data && typeof row.call_data === 'object'
      ? row.call_data
      : row?.callData && typeof row.callData === 'object'
        ? row.callData
        : parseJsonObject(row?.call_data || row?.callData || {});
    const triggerType = String(callData?.triggerType || '').trim().toLowerCase();
    if (!['pending', 'processing'].includes(status)) continue;
    if (callType !== 'vapi_call') continue;
    if (triggerType !== 'sequence_next') continue;
    if (typeof updateCallQueueStatus === 'function') {
      await updateCallQueueStatus(row.id, 'cancelled');
      cancelledQueueRows += 1;
    }
  }

  await updateLeadSequenceState(clientKey, phone, {
    status: 'abandoned',
    nextStageScheduledFor: null,
  });

  const existingHandoff = typeof getLeadHandoffByPhone === 'function'
    ? await getLeadHandoffByPhone({ clientKey, leadPhone: phone })
    : null;
  const auditResult = await upsertLeadHandoffAudit({
    clientKey,
    leadPhone: phone,
    actor: actorName,
    action: 'sequence_stop',
    source: existingHandoff?.source || OPERATOR_SEQUENCE_STOP_SOURCE,
    summaryText: existingHandoff?.summaryText || existingHandoff?.summary_text || 'Sequence stopped by operator.',
    existing: existingHandoff,
    upsertLeadHandoff,
    dataTransform: (raw) => {
      const withAudit = appendSequenceOpsAudit(raw, { actor: actorName, action: 'sequence_stop' });
      const seq = withAudit.sequence && typeof withAudit.sequence === 'object' && !Array.isArray(withAudit.sequence)
        ? { ...withAudit.sequence }
        : {};
      return {
        ...withAudit,
        sequence: {
          ...seq,
          stoppedByOperator: true,
          stoppedAt: new Date().toISOString(),
        },
      };
    },
  });

  return {
    ok: auditResult.ok,
    status: 'abandoned',
    cancelledQueueRows,
    handoffSource: existingHandoff?.source || OPERATOR_SEQUENCE_STOP_SOURCE,
  };
}

export async function dismissSequenceSalvageForLead({
  clientKey,
  leadPhone,
  actor = 'operator',
  getLeadHandoffByPhone,
  upsertLeadHandoff,
} = {}) {
  const phone = String(leadPhone || '').trim();
  const actorName = String(actor || 'operator').trim() || 'operator';
  if (!clientKey || !phone) return { ok: false, error: 'missing_fields' };
  if (typeof getLeadHandoffByPhone !== 'function') return { ok: false, error: 'missing_handoff_domain' };
  const handoff = await getLeadHandoffByPhone({ clientKey, leadPhone: phone });
  if (!handoff) return { ok: false, error: 'handoff_not_found' };
  if (String(handoff.source || '') !== SEQUENCE_ABANDONED_HANDOFF_SOURCE) {
    return { ok: false, error: 'handoff_not_abandoned_salvage' };
  }

  const result = await upsertLeadHandoffAudit({
    clientKey,
    leadPhone: phone,
    actor: actorName,
    action: 'salvage_dismiss',
    source: handoff.source,
    summaryText: handoff.summaryText || handoff.summary_text || '',
    existing: handoff,
    upsertLeadHandoff,
    dataTransform: (raw) => markSequenceSalvageDismissed(raw, { actor: actorName }),
  });

  return {
    ok: result.ok,
    source: handoff.source,
  };
}
