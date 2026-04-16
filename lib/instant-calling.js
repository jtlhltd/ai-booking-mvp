// lib/instant-calling.js
// Instant lead calling system - calls leads within 30 seconds of upload

import { isBusinessHoursForTenant } from './business-hours.js';

const MAX_CONCURRENT_VAPI_CALLS = Number(process.env.VAPI_MAX_CONCURRENT || 1);
let currentVapiCalls = 0;
const vapiCallQueue = [];
const activeVapiCallIds = new Set();
const activeVapiCallTimeouts = new Map();

function _releaseOneSlot(reason = 'unknown') {
  currentVapiCalls = Math.max(0, currentVapiCalls - 1);
  const next = vapiCallQueue.shift();
  if (next) next();
  console.log('[VAPI CONCURRENCY] Slot released:', { reason, current: currentVapiCalls, max: MAX_CONCURRENT_VAPI_CALLS });
}

export async function acquireVapiSlot() {
  if (currentVapiCalls < MAX_CONCURRENT_VAPI_CALLS) {
    currentVapiCalls += 1;
    return;
  }
  console.log('[INSTANT CALL] Concurrency limit reached, queuing call. Current:', currentVapiCalls, 'Max:', MAX_CONCURRENT_VAPI_CALLS);
  await new Promise(resolve => vapiCallQueue.push(resolve));
  currentVapiCalls += 1;
}

export function markVapiCallActive(callId, { ttlMs = 30 * 60 * 1000 } = {}) {
  if (!callId) return;
  activeVapiCallIds.add(callId);
  if (activeVapiCallTimeouts.has(callId)) {
    clearTimeout(activeVapiCallTimeouts.get(callId));
  }
  const t = setTimeout(() => {
    if (activeVapiCallIds.has(callId)) {
      activeVapiCallIds.delete(callId);
      activeVapiCallTimeouts.delete(callId);
      _releaseOneSlot('ttl_expired');
    }
  }, ttlMs);
  activeVapiCallTimeouts.set(callId, t);
  console.log('[VAPI CONCURRENCY] Call marked active:', { callId, current: currentVapiCalls, max: MAX_CONCURRENT_VAPI_CALLS });
}

export function releaseVapiSlot({ callId, reason = 'ended' } = {}) {
  if (callId && activeVapiCallIds.has(callId)) {
    activeVapiCallIds.delete(callId);
    const t = activeVapiCallTimeouts.get(callId);
    if (t) clearTimeout(t);
    activeVapiCallTimeouts.delete(callId);
    _releaseOneSlot(reason);
    return;
  }
  // If a callId was provided but we don't recognize it as active, do NOT release.
  // In multi-instance deployments the same webhook can be processed by different instances,
  // and a blind fallback release here would underflow concurrency accounting.
  if (callId) {
    console.log('[VAPI CONCURRENCY] Skip release — callId not active on this instance:', {
      callId,
      reason,
      current: currentVapiCalls,
      max: MAX_CONCURRENT_VAPI_CALLS
    });
    // Optional ops escape hatch: in multi-instance deployments, webhook routing can cause
    // the "ended" signal to land on a different instance than the one that started the call.
    // When MAX_CONCURRENT_VAPI_CALLS is low (often 1), this can stall dialing for long periods.
    // Setting VAPI_CONCURRENCY_RELEASE_UNKNOWN=1 allows releasing a slot even when callId isn't tracked here.
    if (/^(1|true|yes)$/i.test(String(process.env.VAPI_CONCURRENCY_RELEASE_UNKNOWN || '').trim())) {
      if (currentVapiCalls > 0) {
        _releaseOneSlot('unknown_call_id_release');
      }
    }
    return;
  }
  // Fallback release (e.g. start failed before we had a callId)
  _releaseOneSlot(reason || 'unknown');
}

export function getVapiConcurrencyState() {
  return {
    max: MAX_CONCURRENT_VAPI_CALLS,
    current: currentVapiCalls,
    queued: vapiCallQueue.length,
    activeIds: activeVapiCallIds.size
  };
}

/**
 * Call a lead immediately with Vapi
 * @param {Object} params - Call parameters
 * @param {boolean} [params.allowOutsideBusinessHours] - set true only for exceptional tooling paths
 * @returns {Object} - Call result
 */
export async function callLeadInstantly({ clientKey, lead, client, allowOutsideBusinessHours = false, callQueueId = null } = {}) {
  const VAPI_URL = 'https://api.vapi.ai';
  const VAPI_PRIVATE_KEY = process.env.VAPI_PRIVATE_KEY;
  const VAPI_ASSISTANT_ID = process.env.VAPI_ASSISTANT_ID;
  const VAPI_PHONE_NUMBER_ID = process.env.VAPI_PHONE_NUMBER_ID;
  const missing = [];
  if (!VAPI_PRIVATE_KEY) missing.push('VAPI_PRIVATE_KEY');
  if (!VAPI_ASSISTANT_ID) missing.push('VAPI_ASSISTANT_ID');
  if (!VAPI_PHONE_NUMBER_ID) missing.push('VAPI_PHONE_NUMBER_ID');
  if (missing.length) {
    console.error('[INSTANT CALL] Vapi not configured – missing env:', missing.join(', '));
    return { ok: false, error: 'vapi_not_configured', details: `Missing: ${missing.join(', ')}` };
  }

  const tzFallback = process.env.TZ || process.env.TIMEZONE || 'Europe/London';
  if (
    !allowOutsideBusinessHours &&
    !isBusinessHoursForTenant(client || { booking: { timezone: tzFallback } }, new Date(), tzFallback, {
      forOutboundDial: true
    })
  ) {
    console.log('[INSTANT CALL] Skipping — outside business hours', { clientKey });
    return { ok: false, error: 'outside_business_hours', details: 'Outside configured business hours.' };
  }
  
  try {
    const rawPhone = (lead.phone && String(lead.phone).trim()) || '';
    if (!rawPhone) {
      console.error('[INSTANT CALL] Lead phone missing or empty - VAPI may show "Call.start.error get customer"');
      return { ok: false, error: 'lead_phone_missing', details: 'customer.number is required' };
    }
    // Normalize to E.164 so Vapi always gets +44... (required for outbound)
    const { normalizePhoneE164 } = await import('./utils.js');
    const customerNumber = normalizePhoneE164(rawPhone, 'GB') || rawPhone;
    if (!/^\+[1-9]\d{6,14}$/.test(customerNumber)) {
      console.warn('[INSTANT CALL] Lead phone may not be E.164:', customerNumber, '(raw:', rawPhone, ') - VAPI may reject');
    }

    const tzDial = client?.booking?.timezone || client?.timezone || tzFallback;
    const { claimOutboundWeekdayJourneySlot, rollbackOutboundWeekdayJourneySlot, cancelDuplicatePendingCalls } =
      await import('../db.js');

    // If this dial originated from call_queue, aggressively cancel other pending duplicates for the same phone.
    // Otherwise parallel queue workers can race the same number and burn the weekday slot on "phantom" attempts.
    const qid = callQueueId != null ? parseInt(String(callQueueId), 10) : NaN;
    if (Number.isFinite(qid) && qid > 0) {
      try {
        const cancelled = await cancelDuplicatePendingCalls(clientKey, rawPhone, qid);
        if (cancelled > 0) {
          console.log('[INSTANT CALL] Cancelled duplicate pending queue rows before weekday claim:', {
            clientKey,
            phone: rawPhone,
            cancelled,
            queueId: qid
          });
        }
      } catch (e) {
        console.warn('[INSTANT CALL] Failed to cancel duplicate pending queue rows (non-fatal):', e?.message || e);
      }
    }

    const dialClaim = await claimOutboundWeekdayJourneySlot(clientKey, rawPhone, tzDial);
    if (!dialClaim.ok) {
      if (dialClaim.reason === 'journey_terminal') {
        console.log('[INSTANT CALL] Skipping — outbound weekday journey complete (no more auto dials)', {
          clientKey,
          phone: customerNumber,
          reason: dialClaim.reason,
          closedReason: dialClaim.closedReason
        });
        return {
          ok: false,
          error: 'outbound_journey_complete',
          details:
            'This number’s outbound journey is closed (live answer or five Mon–Fri attempts). Clear the journey row to dial again.'
        };
      }
      if (dialClaim.reason === 'not_weekday') {
        console.log('[INSTANT CALL] Skipping — not a Mon–Fri dial day in tenant timezone', { clientKey, phone: customerNumber });
        return {
          ok: false,
          error: 'outside_business_hours',
          details: 'Outbound weekday journey only applies Monday–Friday in the tenant timezone.'
        };
      }
      console.log('[INSTANT CALL] Skipping — weekday dial slot already used for this journey', {
        clientKey,
        phone: customerNumber,
        reason: dialClaim.reason
      });
      return {
        ok: false,
        error: 'daily_dial_limit',
        details: 'At most one outbound attempt per phone per weekday bucket (Mon–Fri, tenant timezone) until the journey completes.'
      };
    }
    let claimedWeekdaySlot = true;

    console.log(`[INSTANT CALL] Calling ${lead.name || customerNumber} (score: ${lead.leadScore || 'N/A'})...`);
    
    // Get client's Vapi settings from database
    // Note: getFullClient returns client.vapi, not client.vapi_json
    const clientAssistantId = client?.vapi?.assistantId || client?.vapiAssistantId || VAPI_ASSISTANT_ID;
    const clientPhoneNumberId = client?.vapi?.phoneNumberId || client?.vapiPhoneNumberId || VAPI_PHONE_NUMBER_ID;
    
    console.log(`[INSTANT CALL] Using assistant: ${clientAssistantId}, phone: ${clientPhoneNumberId}`);
    
    // Generate correlation ID if not provided
    const correlationId = lead.correlationId || `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Prepare Vapi call payload (customer.number must be E.164; missing/invalid can cause "Call.start.error get customer")
    // Note: serverUrl is not accepted on create-call; set webhook URL on the assistant or in Vapi dashboard.
    const payload = {
      assistantId: clientAssistantId,
      phoneNumberId: clientPhoneNumberId,
      customer: {
        number: customerNumber,
        name: (lead.name || 'Prospect').substring(0, 40)
      },
      metadata: {
        tenantKey: clientKey,
        clientKey: clientKey,
        leadPhone: customerNumber,
        leadName: lead.name,
        // IMPORTANT: businessName = company we are calling (lead). Never use clientKey here —
        // that leaks tenant slug (e.g. d2d-xpress-tom) into sheets and transcripts.
        businessName: (lead.name && String(lead.name).trim()) || '',
        tenantBusinessName: client?.displayName || client?.name || clientKey,
        service: lead.service || 'consultation',
        industry: client?.industry || 'general',
        source: lead.source || 'csv_import',
        leadScore: lead.leadScore || 50,
        importedAt: new Date().toISOString(),
        correlationId,
        requestId: correlationId,
        callPurpose: 'outbound_lead_qual'
      }
    };

    // Add assistant overrides if provided (for variable values, etc.)
    if (client?.assistantOverrides) {
      payload.assistantOverrides = client.assistantOverrides;
    }

    // Outbound A/B: independent voice / opening / script experiments, or legacy single outboundAbExperiment
    const trimExp = (x) =>
      x != null && String(x).trim() !== '' ? String(x).trim() : '';
    const vapi = client?.vapi || {};
    let voiceExp = trimExp(vapi.outboundAbVoiceExperiment);
    let openingExp = trimExp(vapi.outboundAbOpeningExperiment);
    let scriptExp = trimExp(vapi.outboundAbScriptExperiment);
    let legacyExp = trimExp(vapi.outboundAbExperiment);

    if (!voiceExp && !openingExp && !scriptExp) {
      try {
        const { inferOutboundAbExperimentNamesForDimensions } = await import('../db.js');
        const inferredDim = await inferOutboundAbExperimentNamesForDimensions(clientKey);
        if (inferredDim.voice) voiceExp = inferredDim.voice;
        if (inferredDim.opening) openingExp = inferredDim.opening;
        if (inferredDim.script) scriptExp = inferredDim.script;
      } catch {
        /* non-fatal */
      }
    }

    const useDimensional = !!(voiceExp || openingExp || scriptExp);
    const focusRaw = trimExp(vapi.outboundAbFocusDimension).toLowerCase();
    const focusValid =
      focusRaw === 'voice' || focusRaw === 'opening' || focusRaw === 'script' ? focusRaw : '';

    try {
      const {
        selectABTestVariantForLead,
        buildAssistantOverridesFromVariantConfig,
        mergeAssistantOverrides
      } = await import('./outbound-ab-variant.js');
      const { resolveOutboundAbDimensionsForDial } = await import('./outbound-ab-focus.js');

      if (useDimensional) {
        const dialDims = resolveOutboundAbDimensionsForDial({
          voiceExp,
          openingExp,
          scriptExp,
          focusDimension: focusValid
        });
        if (
          dialDims.length === 0 &&
          (voiceExp || openingExp || scriptExp) &&
          [voiceExp, openingExp, scriptExp].filter(Boolean).length > 1
        ) {
          console.warn(
            '[INSTANT CALL] Multiple outbound A/B dimensions are configured; set vapi.outboundAbFocusDimension to voice, opening, or script. Dimensional overrides skipped for this dial.'
          );
        }
        const abOutbound = {};
        for (const [dim, expName] of dialDims) {
          const selected = await selectABTestVariantForLead(clientKey, expName, customerNumber);
          if (!selected) continue;
          abOutbound[dim] = { experiment: expName, variant: selected.name };
          const { overrides } = buildAssistantOverridesFromVariantConfig(selected.config, dim, {
            variantName: selected.name
          });
          if (overrides && Object.keys(overrides).length > 0) {
            payload.assistantOverrides = mergeAssistantOverrides(payload.assistantOverrides, overrides);
          }
        }
        if (Object.keys(abOutbound).length > 0) {
          payload.metadata.abOutbound = abOutbound;
        }
      } else {
        let outboundAbExperiment = legacyExp;
        if (!outboundAbExperiment) {
          try {
            const { inferOutboundAbExperimentName } = await import('../db.js');
            const inferred = await inferOutboundAbExperimentName(clientKey);
            if (inferred) outboundAbExperiment = inferred;
          } catch {
            /* non-fatal */
          }
        }
        if (outboundAbExperiment) {
          const selected = await selectABTestVariantForLead(
            clientKey,
            outboundAbExperiment,
            customerNumber
          );
          if (selected) {
            payload.metadata.abExperiment = outboundAbExperiment;
            payload.metadata.abVariant = selected.name;
            const { overrides } = buildAssistantOverridesFromVariantConfig(selected.config);
            if (overrides && Object.keys(overrides).length > 0) {
              payload.assistantOverrides = mergeAssistantOverrides(payload.assistantOverrides, overrides);
            }
          }
        }
      }
    } catch (abErr) {
      console.error(
        '[INSTANT CALL] Outbound A/B error (call proceeds without AB overrides):',
        abErr?.message || abErr
      );
    }

    // Optional: pass IVR/DTMF keypad rules into metadata/overrides for the assistant to use.
    // Requires the Vapi assistant prompt/tooling to actually send DTMF based on these rules.
    const ivrRules = client?.vapi?.ivr || client?.vapi?.dtmf || client?.ivr || null;
    if (ivrRules) {
      payload.metadata.ivr = ivrRules;
      if (!payload.assistantOverrides) payload.assistantOverrides = {};
      const vv = payload.assistantOverrides.variableValues && typeof payload.assistantOverrides.variableValues === 'object'
        ? payload.assistantOverrides.variableValues
        : {};
      payload.assistantOverrides.variableValues = { ...vv, ivr: ivrRules };
    }
    
    // Make Vapi API call with circuit breaker and timeout, guarded by global concurrency limiter
    const { withCircuitBreaker } = await import('./circuit-breaker.js');
    const { fetchWithTimeout, TIMEOUTS } = await import('./timeouts.js');
    
    // Acquire a slot for an ACTIVE call. We only release this when end-of-call-report arrives.
    await acquireVapiSlot();
    let result;
    try {
      result = await withCircuitBreaker(
        'vapi_call',
        async () => {
          console.log('[INSTANT CALL] Sending POST to Vapi', `${VAPI_URL}/call`, { customerNumber: payload.customer?.number, assistantId: (payload.assistantId || '').slice(0, 16) + ((payload.assistantId && payload.assistantId.length > 16) ? '...' : '') });
          console.log('[INSTANT CALL] POST https://api.vapi.ai/call payload:', JSON.stringify(payload, null, 2));
          const response = await fetchWithTimeout(
            `${VAPI_URL}/call`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${VAPI_PRIVATE_KEY}`,
                'Content-Type': 'application/json',
                'X-Correlation-ID': correlationId,
                'X-Request-ID': correlationId
              },
              body: JSON.stringify(payload)
            },
            TIMEOUTS.vapi
          );
          console.log('[INSTANT CALL] Vapi response status:', response.status, response.statusText);
          if (!response.ok) {
            const error = await response.text();
            // Don't retry on 400-level errors (bad request)
            if (response.status >= 400 && response.status < 500) {
              console.error(`[INSTANT CALL] Vapi client error (${response.status}):`, error);
              return { ok: false, error: 'vapi_client_error', details: error, statusCode: response.status };
            }
            // Throw for 5xx errors to trigger circuit breaker
            throw new Error(`VAPI API error: ${response.status} - ${error}`);
          }
          const data = await response.json();
          return { ok: true, ...data };
        },
        async () => {
          // Fallback: Send SMS instead
          console.log('[INSTANT CALL] Circuit breaker open, using SMS fallback');
          const messagingService = (await import('./messaging-service.js')).default;
          await messagingService.sendSMS({
            to: lead.phoneNumber,
            message: `Hi ${lead.decisionMaker}, ${client?.displayName || 'We'} tried to call you but had a technical issue. Please call us back or reply with your preferred time.`,
            clientKey
          });
          return { ok: false, error: 'circuit_breaker_open', fallback: 'sms_sent' };
        }
      );
    } catch (e) {
      // Start failed before we have a callId; release immediately
      releaseVapiSlot({ reason: 'start_failed' });
      if (claimedWeekdaySlot) {
        await rollbackOutboundWeekdayJourneySlot(clientKey, rawPhone, tzDial).catch(() => {});
        claimedWeekdaySlot = false;
      }
      throw e;
    }
    
    if (!result || !result.ok || !result.id) {
      // No callId returned; release slot
      releaseVapiSlot({ reason: 'no_call_id' });
      if (claimedWeekdaySlot) {
        await rollbackOutboundWeekdayJourneySlot(clientKey, rawPhone, tzDial).catch(() => {});
        claimedWeekdaySlot = false;
      }
      return { ok: false, error: result?.error || 'call_failed', details: result?.details };
    }

    // Hold the slot until we receive end-of-call-report for this callId
    markVapiCallActive(result.id, { ttlMs: 30 * 60 * 1000 });
    claimedWeekdaySlot = false;
    
    console.log(`[INSTANT CALL] ✅ Call initiated for ${lead.phone} - Call ID: ${result.id}`);
    
    // Save call to database immediately so dashboard shows it
    try {
      const { upsertCall } = await import('../db.js');
      await upsertCall({
        callId: result.id,
        clientKey: clientKey,
        leadPhone: lead.phone,
        status: 'initiated', // Will be updated by webhooks when call progresses
        outcome: null,
        duration: null,
        cost: null,
        metadata: {
          tenantKey: clientKey,
          leadPhone: lead.phone,
          leadName: lead.name,
          leadService: lead.service,
          leadSource: lead.source,
          leadScore: lead.leadScore,
          initiatedAt: new Date().toISOString(),
          fromQueue: false,
          ...(payload.metadata?.abExperiment && { abExperiment: payload.metadata.abExperiment }),
          ...(payload.metadata?.abVariant && { abVariant: payload.metadata.abVariant }),
          ...(payload.metadata?.abOutbound && typeof payload.metadata.abOutbound === 'object'
            ? { abOutbound: payload.metadata.abOutbound }
            : {})
        },
        retryAttempt: 0
      });
      console.log(`[INSTANT CALL] 💾 Call saved to database: ${result.id}`);
    } catch (dbError) {
      console.error('[INSTANT CALL] Failed to save call to database:', dbError);
      // Don't fail the call if database save fails - webhook will save it later
    }
    
    // === NEW: Emit real-time event ===
    try {
      const { emitCallStarted } = await import('./realtime-events.js');
      emitCallStarted(clientKey, {
        callId: result.id,
        leadPhone: lead.phone,
        leadName: lead.name,
        status: 'in_progress'
      });
    } catch (error) {
      console.error('[REALTIME EVENT ERROR]', error);
      // Don't fail the call if real-time fails
    }
    
    return {
      ok: true,
      callId: result.id,
      status: result.status,
      leadPhone: lead.phone,
      leadName: lead.name,
      leadScore: lead.leadScore,
      ...(payload.metadata?.abExperiment && { abExperiment: payload.metadata.abExperiment }),
      ...(payload.metadata?.abVariant && { abVariant: payload.metadata.abVariant }),
      ...(payload.metadata?.abOutbound && typeof payload.metadata.abOutbound === 'object'
        ? { abOutbound: payload.metadata.abOutbound }
        : {})
    };
    
  } catch (error) {
    console.error(`[INSTANT CALL ERROR]`, error);
    return { ok: false, error: error.message };
  }
}

/**
 * Process call queue with intelligent rate limiting
 * @param {Array} leads - Array of leads to call
 * @param {Object} client - Client data
 * @param {Object} options - Processing options
 */
export async function processCallQueue(leads, client, options = {}) {
  const {
    maxConcurrent = 1, // Must stay 1 to respect Vapi org concurrency / our slot until EOCR
    delayBetweenCalls = 2000, // 2 seconds between each call
    maxCallsPerBatch = 50 // Process 50 at a time
  } = options;
  
  console.log(`[CALL QUEUE] Processing ${leads.length} leads for ${client.client_key}`);
  
  const results = {
    total: leads.length,
    initiated: 0,
    failed: 0,
    skipped: 0,
    callIds: []
  };
  
  // Process in batches to avoid overwhelming Vapi
  const batches = [];
  for (let i = 0; i < leads.length; i += maxCallsPerBatch) {
    batches.push(leads.slice(i, i + maxCallsPerBatch));
  }
  
  for (const [batchIndex, batch] of batches.entries()) {
    console.log(`[CALL QUEUE] Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} leads)`);
    
    for (const lead of batch) {
      try {
        // Call instantly
        const callResult = await callLeadInstantly({
          clientKey: client.client_key,
          lead,
          client
        });
        
        if (callResult.ok) {
          results.initiated++;
          results.callIds.push(callResult.callId);
          console.log(`[CALL QUEUE] ${results.initiated}/${leads.length}: ✅ ${lead.phone}`);
        } else {
          results.failed++;
          console.log(`[CALL QUEUE] ${results.initiated}/${leads.length}: ❌ ${lead.phone} - ${callResult.error}`);
        }
        
        // Delay between calls (prevent rate limiting)
        if (delayBetweenCalls > 0) {
          await new Promise(resolve => setTimeout(resolve, delayBetweenCalls));
        }
        
      } catch (error) {
        results.failed++;
        console.error(`[CALL QUEUE] Error calling ${lead.phone}:`, error);
      }
    }
    
    // Delay between batches (5 seconds)
    if (batchIndex < batches.length - 1) {
      console.log(`[CALL QUEUE] Batch complete. Waiting 5 seconds before next batch...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  
  console.log(`[CALL QUEUE] ✅ Complete: ${results.initiated} calls initiated, ${results.failed} failed`);
  
  return results;
}

/**
 * Helper function for delays
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate estimated completion time
 * @param {number} leadCount - Number of leads
 * @param {number} delayMs - Delay between calls in ms
 * @returns {Object} - Time estimates
 */
export function estimateCallTime(leadCount, delayMs = 2000) {
  const totalSeconds = (leadCount * delayMs) / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  
  return {
    totalSeconds,
    formatted: `${minutes}m ${seconds}s`,
    completionTime: new Date(Date.now() + totalSeconds * 1000).toLocaleString('en-GB')
  };
}

