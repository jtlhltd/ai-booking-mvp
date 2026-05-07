/**
 * Outbound multi-stage sequence advancement (end-of-call-report path).
 * Enqueues the next stage via call_queue only — never dials Vapi inline.
 */

import {
  getValidatedOutboundSequence,
  getStageById,
  isStageComplete,
  pickNextStage,
  computeNextStageScheduledFor,
  mergeStructuredFromCompletedStages,
  isOutboundSequenceGloballyDisabled
} from '../outbound-sequence.js';

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

function buildSequenceHandoffPayload(seq, flat, stagesCompleted) {
  const merged = { ...mergeStructuredFromCompletedStages(stagesCompleted || []), ...(flat || {}) };
  return {
    ...merged,
    sequence: {
      stages: Array.isArray(stagesCompleted) ? stagesCompleted : [],
      status: seq?.status || 'unknown'
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
    getLatestCallInsights
  } = await import('../../db.js');

  const client = await getFullClient(tenantKey, { bypassCache: true }).catch(() => null);
  const cfg = getValidatedOutboundSequence(client);
  if (!cfg) return;

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
        data: buildSequenceHandoffPayload(seq, flat, stages),
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
          data: buildSequenceHandoffPayload(seq, flat, seq.stagesCompleted),
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
        data: {
          ...flat,
          sequence: { stages: stagesDone }
        },
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
      stageId: picked.nextStageId,
      leadId,
      leadName: metadata.leadName || metadata.businessName || '',
      leadService: metadata.service || '',
      leadSource: metadata.source || 'sequence',
      prevCallId: callId
    }
  });
}
