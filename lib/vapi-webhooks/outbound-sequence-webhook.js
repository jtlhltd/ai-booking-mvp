/**
 * Outbound multi-stage sequence advancement (end-of-call-report path).
 * Enqueues the next stage via call_queue only — never dials Vapi inline.
 */

import {
  getValidatedOutboundSequence,
  getHandoffImportContextKeys,
  getStageById,
  isStageComplete,
  pickNextStage,
  computeNextStageScheduledFor,
  mergeStructuredFromCompletedStages,
  isOutboundSequenceGloballyDisabled
} from '../outbound-sequence.js';
import { normalizeLeadDialContext } from '../lead-dial-context.js';
import { phoneMatchKey } from '../lead-phone-key.js';

function mergeStructuredSources(sources) {
  const out = {};
  if (!Array.isArray(sources)) return out;
  for (const s of sources) {
    if (s && typeof s === 'object' && !Array.isArray(s)) {
      Object.assign(out, s);
    }
  }
  return out;
}

async function getLatestLeadDialContext(query, tenantKey, leadPhone) {
  const phone = String(leadPhone || '').trim();
  const matchKey = phoneMatchKey(phone);
  const sql = matchKey
    ? `SELECT lead_dial_context_json AS "leadDialContextJson"
       FROM leads
       WHERE client_key = $1 AND (phone_match_key = $2 OR phone = $3)
       ORDER BY created_at DESC
       LIMIT 1`
    : `SELECT lead_dial_context_json AS "leadDialContextJson"
       FROM leads
       WHERE client_key = $1 AND phone = $2
       ORDER BY created_at DESC
       LIMIT 1`;
  const result = await query(sql, matchKey ? [tenantKey, matchKey, phone] : [tenantKey, phone]);
  return result?.rows?.[0]?.leadDialContextJson ?? null;
}

function buildHandoffImportContext(cfg, rawLeadDialContext) {
  const source = normalizeLeadDialContext(rawLeadDialContext);
  const keys = getHandoffImportContextKeys(cfg);
  const out = {};
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) out[key] = trimmed;
      continue;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      out[key] = value;
      continue;
    }
    if (typeof value === 'boolean') {
      out[key] = value;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

function buildSequenceHandoffPayload(seq, flat, stagesCompleted, importContext = null) {
  const stages = Array.isArray(stagesCompleted) ? stagesCompleted : [];
  const merged = { ...mergeStructuredFromCompletedStages(stages), ...(flat || {}) };
  return {
    ...merged,
    sequence: {
      stages,
      status: seq?.status || 'unknown'
    },
    qual: {
      ...merged,
      ...(importContext ? { _importContext: importContext } : {}),
      _sequenceStages: stages
    }
  };
}

/**
 * @param {object} params
 * @param {string} params.tenantKey
 * @param {string} params.leadPhone
 * @param {object} params.metadata
 * @param {string} [params.correlationId]
 * @param {string} params.callId
 * @param {string} [params.outcome]
 * @param {boolean} [params.noUsefulOutcome]
 * @param {Array<Record<string, unknown>|null|undefined>} params.structuredSources
 */
export async function handleOutboundSequenceEndOfCall(params) {
  const {
    tenantKey,
    leadPhone,
    metadata = {},
    correlationId = '',
    callId,
    outcome = '',
    noUsefulOutcome = false,
    structuredSources = []
  } = params;

  if (isOutboundSequenceGloballyDisabled()) return;
  if (!tenantKey || !leadPhone || !callId) return;
  const stageIdMeta = metadata?.stageId != null ? String(metadata.stageId).trim() : '';
  if (!stageIdMeta) return;

  const {
    getFullClient,
    getLeadSequenceState,
    updateLeadSequenceState,
    addToCallQueue,
    upsertLeadHandoff,
    getLatestCallInsights,
    query
  } = await import('../../db.js');

  const client = await getFullClient(tenantKey, { bypassCache: true }).catch(() => null);
  const cfg = getValidatedOutboundSequence(client);
  if (!cfg) return;

  let handoffImportContextLoaded = false;
  let handoffImportContext = null;
  async function getHandoffImportContext() {
    if (handoffImportContextLoaded) return handoffImportContext;
    handoffImportContextLoaded = true;
    try {
      const rawLeadDialContext = await getLatestLeadDialContext(query, tenantKey, leadPhone);
      handoffImportContext = buildHandoffImportContext(cfg, rawLeadDialContext);
    } catch (e) {
      console.warn(`[${correlationId}] [OUTBOUND SEQUENCE] lead import context lookup failed`, e?.message || e);
      handoffImportContext = null;
    }
    return handoffImportContext;
  }

  const seq = await getLeadSequenceState(tenantKey, leadPhone);
  if (!seq || seq.status !== 'active') return;

  if (String(seq.currentStageId || '').trim() !== stageIdMeta) {
    console.warn(`[${correlationId}] [OUTBOUND SEQUENCE] stage mismatch`, {
      expected: seq.currentStageId,
      metadata: stageIdMeta
    });
    return;
  }

  const stage = getStageById(client, stageIdMeta);
  if (!stage) return;

  const flat = mergeStructuredSources(structuredSources);
  const maxDials = Number(cfg.maxTotalDialsPerLead ?? 999) || 999;
  const maxDays = Number(cfg.maxSequenceDurationDays ?? 999) || 999;
  const nextTotal = (Number(seq.attemptsTotal) || 0) + 1;

  const startedAt = seq.startedAt ? new Date(seq.startedAt) : new Date();
  const durationExceeded =
    Number.isFinite(startedAt.getTime()) &&
    Date.now() - startedAt.getTime() > maxDays * 24 * 60 * 60 * 1000;

  if (nextTotal > maxDials || durationExceeded) {
    const stages = Array.isArray(seq.stagesCompleted) ? [...seq.stagesCompleted] : [];
    await updateLeadSequenceState(tenantKey, leadPhone, {
      status: 'abandoned',
      attemptsTotal: nextTotal,
      lastCallId: callId,
      attemptsInStage: seq.attemptsInStage
    });
    try {
      await upsertLeadHandoff({
        clientKey: tenantKey,
        leadPhone,
        callId,
        source: 'vapi_webhook.sequence_abandoned',
        data: buildSequenceHandoffPayload(seq, flat, stages, await getHandoffImportContext()),
        summaryText: `Sequence abandoned (${durationExceeded ? 'duration' : 'dial_cap'})`,
        decisionMaker: flat.decisionMakerName || flat.decisionMaker || '',
        callbackWindow: flat.bestCallbackWindow || flat.callbackWindow || ''
      });
    } catch (e) {
      console.warn(`[${correlationId}] [OUTBOUND SEQUENCE] handoff on abandon failed`, e?.message || e);
    }
    return;
  }

  const complete =
    !noUsefulOutcome &&
    !['voicemail', 'no-answer', 'busy', 'declined', 'failed'].includes(String(outcome || '').toLowerCase()) &&
    isStageComplete(stage, flat);

  if (!complete) {
    const maxA = Number(/** @type {any} */ (stage).maxAttemptsInStage) || 3;
    const nextInStage = (Number(seq.attemptsInStage) || 0) + 1;
    if (nextInStage >= maxA) {
      await updateLeadSequenceState(tenantKey, leadPhone, {
        status: 'abandoned',
        attemptsInStage: nextInStage,
        attemptsTotal: nextTotal,
        lastCallId: callId
      });
      try {
        await upsertLeadHandoff({
          clientKey: tenantKey,
          leadPhone,
          callId,
          source: 'vapi_webhook.sequence_abandoned',
          data: buildSequenceHandoffPayload(seq, flat, seq.stagesCompleted, await getHandoffImportContext()),
          summaryText: 'Sequence abandoned (max attempts in stage)',
          decisionMaker: flat.decisionMakerName || flat.decisionMaker || '',
          callbackWindow: flat.bestCallbackWindow || flat.callbackWindow || ''
        });
      } catch (e) {
        console.warn(`[${correlationId}] [OUTBOUND SEQUENCE] handoff on stage-cap failed`, e?.message || e);
      }
      return;
    }
    await updateLeadSequenceState(tenantKey, leadPhone, {
      attemptsInStage: nextInStage,
      attemptsTotal: nextTotal,
      lastCallId: callId
    });
    return;
  }

  const snap = {
    stageId: /** @type {any} */ (stage).id,
    completedAt: new Date().toISOString(),
    callId,
    structuredData: flat
  };
  const stagesDone = [...(Array.isArray(seq.stagesCompleted) ? seq.stagesCompleted : []), snap];

  const picked = pickNextStage(client, stageIdMeta, flat);
  if (picked.isFinal) {
    await updateLeadSequenceState(tenantKey, leadPhone, {
      status: 'completed',
      stagesCompleted: stagesDone,
      attemptsTotal: nextTotal,
      attemptsInStage: 0,
      lastCallId: callId,
      currentStageId: stageIdMeta
    });
    try {
      await upsertLeadHandoff({
        clientKey: tenantKey,
        leadPhone,
        callId,
        source: 'vapi_webhook.sequence_completed',
        data: buildSequenceHandoffPayload(
          { ...seq, status: 'completed' },
          flat,
          stagesDone,
          await getHandoffImportContext()
        ),
        summaryText: flat.transcriptSnippet || '',
        decisionMaker: flat.decisionMakerName || flat.decisionMaker || '',
        callbackWindow: flat.callbackPreference || flat.bestCallbackWindow || ''
      });
    } catch (e) {
      console.warn(`[${correlationId}] [OUTBOUND SEQUENCE] final handoff failed`, e?.message || e);
    }
    return;
  }

  if (!picked.nextStageId) return;

  const nextStage = getStageById(client, picked.nextStageId);
  if (!nextStage) return;

  const insightsRow = await getLatestCallInsights(tenantKey).catch(() => null);
  const routing = insightsRow?.routing || null;
  const fallbackTz = client?.timezone || client?.booking?.timezone || process.env.TZ || 'Europe/London';

  let scheduledFor = await computeNextStageScheduledFor(nextStage, flat, new Date(), {
    tenant: client,
    routing,
    fallbackTz,
    clientKey: tenantKey,
    jitterKey: leadPhone
  });
  const nowMs = Date.now();
  if (scheduledFor.getTime() <= nowMs) {
    console.warn(`[${correlationId}] [OUTBOUND SEQUENCE] scheduled_for not in future, bumping`, scheduledFor.toISOString());
    scheduledFor.setTime(nowMs + 120_000);
  }

  await updateLeadSequenceState(tenantKey, leadPhone, {
    currentStageId: picked.nextStageId,
    stagesCompleted: stagesDone,
    attemptsInStage: 0,
    attemptsTotal: nextTotal,
    lastCallId: callId,
    nextStageScheduledFor: scheduledFor.toISOString()
  });

  const leadId = metadata.leadId != null ? metadata.leadId : null;
  await addToCallQueue({
    clientKey: tenantKey,
    leadPhone,
    priority: 5,
    scheduledFor,
    callType: 'vapi_call',
    callData: {
      triggerType: 'sequence_next',
      outboundDialMode: 'sequence',
      stageId: picked.nextStageId,
      leadId,
      leadName: metadata.leadName || metadata.businessName || '',
      leadService: metadata.service || '',
      leadSource: metadata.source || 'sequence',
      prevCallId: callId
    }
  });
}
