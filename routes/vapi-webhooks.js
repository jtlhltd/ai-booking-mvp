import express from 'express';
import * as store from '../store.js';
import * as sheets from '../sheets.js';
import { analyzeCall } from '../lib/call-quality-analysis.js';
import messagingService from '../lib/messaging-service.js';
import { sendOperatorAlert } from '../lib/operator-alerts.js';
import { extractLogisticsFields } from '../lib/logistics-extractor.js';
import { recordReceptionistTelemetry } from '../lib/demo-telemetry.js';
import { storeCallContext } from '../lib/call-context-cache.js';
import { verifyVapiSignature } from '../middleware/vapi-webhook-verification.js';
import { mapVapiEndedReasonToOutcome } from '../lib/vapi-call-outcome-map.js';
import { vapiWebhookVerboseLog } from '../lib/vapi-webhook-verbose-log.js';
import { query, dbType } from '../db.js';

function isPostgres() {
  return dbType === 'postgres';
}

function pickVapiCallId(body) {
  return body?.call?.id || body?.id || body?.callId || body?.message?.call?.id || body?.message?.callId || null;
}

function pickVapiEventType(body) {
  return body?.message?.type || body?.type || null;
}

/**
 * DB-backed idempotency key. Must be stable across retries and unique per webhook delivery.
 * VAPI doesn't always provide a top-level event id, so we derive one from callId + message type.
 * For conversation-update we include message count to avoid collapsing distinct updates.
 */
function deriveVapiEventId(body) {
  const callId = pickVapiCallId(body) || 'no_call_id';
  const type = pickVapiEventType(body) || 'unknown';
  if (type === 'conversation-update') {
    const n = Array.isArray(body?.message?.messages)
      ? body.message.messages.length
      : Array.isArray(body?.message?.conversation)
        ? body.message.conversation.length
        : 0;
    return `${callId}:${type}:${n}`;
  }
  return `${callId}:${type}`;
}

async function tryInsertWebhookEvent({ provider, eventId, callId, eventType, correlationId, payload, headers }) {
  if (!isPostgres()) {
    // Only Postgres has durable idempotency guarantees today.
    return { inserted: true };
  }
  try {
    const r = await query(
      `
      INSERT INTO webhook_events (
        provider, event_id, call_id, event_type, correlation_id, payload_json, headers_json
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (provider, event_id) DO NOTHING
      RETURNING id
    `,
      [
        provider,
        eventId,
        callId,
        eventType,
        correlationId,
        JSON.stringify(payload || {}),
        JSON.stringify(headers || {})
      ]
    );
    return { inserted: Array.isArray(r?.rows) && r.rows.length > 0 };
  } catch (e) {
    // If the table doesn't exist yet (migration not applied), don't break webhooks.
    const msg = String(e?.message || '');
    if (msg.toLowerCase().includes('webhook_events') || msg.toLowerCase().includes('relation')) {
      console.warn('[VAPI WEBHOOK] webhook_events table not available yet; proceeding without DB idempotency');
      return { inserted: true, degraded: true };
    }
    throw e;
  }
}

async function markWebhookEventProcessingStarted({ provider, eventId }) {
  if (!isPostgres()) return;
  await query(
    `
    UPDATE webhook_events
    SET processing_started_at = NOW()
    WHERE provider = $1 AND event_id = $2 AND processing_started_at IS NULL
  `,
    [provider, eventId]
  );
}

async function markWebhookEventProcessed({ provider, eventId }) {
  if (!isPostgres()) return;
  await query(
    `
    UPDATE webhook_events
    SET processed_at = NOW(), processing_error = NULL
    WHERE provider = $1 AND event_id = $2
  `,
    [provider, eventId]
  );
}

async function markWebhookEventFailed({ provider, eventId, error }) {
  if (!isPostgres()) return;
  await query(
    `
    UPDATE webhook_events
    SET processing_error = $3
    WHERE provider = $1 AND event_id = $2
  `,
    [provider, eventId, String(error?.message || error || 'unknown_error').slice(0, 10000)]
  );
}

/**
 * Logistics sheet "Business Name" = company we dialed (callee), never the tenant `client_key` slug.
 */
function pickCalleeBusinessNameForSheet({
  tenantKey,
  metadata = {},
  customerName,
  structuredFields = {}
}) {
  const tk = String(tenantKey || '').trim().toLowerCase();
  const isBad = (s) => {
    const v = String(s ?? '').trim();
    if (!v) return true;
    if (tk && v.toLowerCase() === tk) return true;
    return false;
  };
  const candidates = [
    metadata?.leadName,
    metadata?.businessName,
    structuredFields?.businessName,
    structuredFields?.companyName,
    customerName,
  ];
  for (const c of candidates) {
    if (isBad(c)) continue;
    return String(c).trim();
  }
  return '';
}

const router = express.Router();

// Middleware to preserve raw body for signature verification
// Note: Global express.json() may have already parsed the body, so we handle both cases
router.use('/webhooks/vapi', (req, res, next) => {
  // If body is already parsed (from global express.json()), use it directly
  // Otherwise, try to get raw body if available
  if (typeof req.body === 'object' && req.body !== null && !Buffer.isBuffer(req.body)) {
    // Body already parsed by global express.json() middleware
    req.rawBody = Buffer.from(JSON.stringify(req.body), 'utf8');
    // req.body is already the parsed object, so we're good
    vapiWebhookVerboseLog('[VAPI WEBHOOK MIDDLEWARE] Body already parsed, using directly. Keys:', Object.keys(req.body || {}));
  } else if (Buffer.isBuffer(req.body)) {
    // Body is a Buffer (from express.raw() if it was used)
    req.rawBody = req.body;
    try {
      const bodyString = req.body.toString('utf8');
      if (bodyString && bodyString.length > 0) {
        req.body = JSON.parse(bodyString);
      } else {
        console.error('[VAPI WEBHOOK MIDDLEWARE] Empty body string from Buffer');
        req.body = {};
      }
    } catch (e) {
      console.error('[VAPI WEBHOOK MIDDLEWARE] JSON parse error:', e.message);
      req.body = {};
    }
  } else {
    // Body might be empty or in unexpected format
    console.error('[VAPI WEBHOOK MIDDLEWARE] Unexpected body type:', typeof req.body, 'Value:', req.body);
    req.rawBody = Buffer.alloc(0);
    req.body = req.body || {};
  }
  next();
});

// In-memory store for conversation-update messages (VAPI sends messages incrementally, not in end-of-call-report)
// Bounded to avoid memory growth
const callStore = new Map();
const CALL_STORE_MAX = 200;

// In-memory deduplication of processed call IDs (best-effort, survives process lifetime)
const processedCallIds = new Set();
function markProcessed(callId) {
  if (!callId) return;
  processedCallIds.add(callId);
  // Keep memory bounded
  if (processedCallIds.size > 500) {
    const first = processedCallIds.values().next().value;
    processedCallIds.delete(first);
  }
}

/** Format message array (from conversation-update) to transcript string */
function formatMessagesToTranscript(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return '';
  return messages
    .map((m) => {
      const role = m?.role || m?.type || 'unknown';
      const content = m?.content || m?.text || m?.message || m?.body || '';
      if (!content) return null;
      if (role === 'system' || role === 'function' || role === 'tool') return null;
      const contentUpper = (typeof content === 'string' ? content : '').toUpperCase();
      if (contentUpper.includes('TOOLS:') || contentUpper.includes('CRITICAL:') ||
          contentUpper.includes('FOLLOW THIS SCRIPT') || contentUpper.includes('DO NOT ADD YOUR OWN') ||
          contentUpper.includes('USE ACCESS_GOOGLE_SHEET') || contentUpper.includes('USE SCHEDULE_CALLBACK')) return null;
      const roleLower = (role || '').toLowerCase();
      const label = (roleLower === 'user' || roleLower === 'customer' || roleLower === 'caller' ||
                     roleLower === 'human' || roleLower === 'person') ? 'User' : 'AI';
      return `${label}: ${content}`;
    })
    .filter(Boolean)
    .join('\n\n');
}

// Enhanced VAPI webhook handler with comprehensive call tracking
router.post('/webhooks/vapi', verifyVapiSignature, async (req, res) => {
  // Extract correlation ID from webhook metadata
  const body = req.body || {};
  const correlationId = body.metadata?.correlationId || 
                        body.metadata?.requestId ||
                        body.call?.metadata?.correlationId ||
                        `webhook_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Attach to request for logging
  req.correlationId = correlationId;
  req.id = correlationId;
  
  console.log(`[${correlationId}] [VAPI WEBHOOK] received type=${body?.message?.type || body?.type || 'unknown'}`);
  
  try {
    // Durable ingest + DB-backed idempotency (Postgres).
    // We insert the event before returning 200 so that retries/multi-instance won't duplicate side-effects.
    const provider = 'vapi';
    const callIdForEvent = pickVapiCallId(body);
    const eventType = pickVapiEventType(body);
    const eventId = deriveVapiEventId(body);
    const ins = await tryInsertWebhookEvent({
      provider,
      eventId,
      callId: callIdForEvent,
      eventType,
      correlationId,
      payload: body,
      headers: req.headers
    });
    if (!ins.inserted) {
      // Already ingested/processed (or in-flight). Always ack to stop provider retries.
      res.status(200).json({ ok: true, received: true, deduped: true });
      return;
    }

    // RAW envelope debug (before any normalization) - per VAPI troubleshooting
    vapiWebhookVerboseLog('RAW TYPE:', body?.message?.type || body?.type);
    if (body?.message?.type === 'end-of-call-report') {
      const rawCall = body?.message?.call;
      vapiWebhookVerboseLog('RAW CALL KEYS:', rawCall ? Object.keys(rawCall) : 'NO CALL');
      vapiWebhookVerboseLog('RAW HAS ARTIFACT FIELD:', rawCall ? 'artifact' in rawCall : 'NO CALL');
      vapiWebhookVerboseLog('RAW ARTIFACT VALUE:', rawCall?.artifact);
      // VAPI diagnostic: message.call.messages count
      const mc = rawCall?.messages;
      const msgCount = Array.isArray(mc) ? mc.length : null;
      const msgKeys = mc && typeof mc === 'object' && !Array.isArray(mc) ? Object.keys(mc) : null;
      vapiWebhookVerboseLog('RAW message.call.messages: type=%s, length=%s, keys=%s', typeof mc, msgCount ?? 'N/A', msgKeys ? JSON.stringify(msgKeys) : 'N/A');
    }
    // Temporary debug: log full payload for end-of-call-report to verify analysis.structuredData
    if (req.body?.type === 'end-of-call-report') {
      vapiWebhookVerboseLog('END OF CALL PAYLOAD:', JSON.stringify(req.body, null, 2));
    }
    vapiWebhookVerboseLog(`[${correlationId}] [VAPI WEBHOOK DEBUG] Raw body:`, JSON.stringify(req.body, null, 2));
    vapiWebhookVerboseLog(`[${correlationId}] [VAPI WEBHOOK DEBUG] Raw body type:`, typeof req.body);
    vapiWebhookVerboseLog(`[${correlationId}] [VAPI WEBHOOK DEBUG] Body keys:`, Object.keys(req.body || {}));
    vapiWebhookVerboseLog(`[${correlationId}] [VAPI WEBHOOK DEBUG] Headers:`, JSON.stringify(req.headers, null, 2));
    // Support VAPI "message" envelope (chat/preview and some assistants)
    const message = body.message || null;
    if (message && typeof message === 'object') {
      // Normalize common fields onto body so downstream logic works unchanged
      body.call = body.call || message.call || {};
      if (!body.status && message.type) body.status = message.type;
      
      // Extract from VAPI's ACTUAL payload structure (per VAPI Composer):
      // - message.call.recordingUrl (NOT message.artifact.recordingUrl)
      // - message.transcript (NOT message.artifact.transcript)
      if (message.call) {
        if (!body.recordingUrl && message.call.recordingUrl) {
          body.recordingUrl = message.call.recordingUrl;
        }
        // Structured Output (artifactPlan): merge call.artifact.structuredOutputs for downstream extraction
        if (message.call.artifact && !body.call.artifact) {
          body.call.artifact = message.call.artifact;
        }
      }
      
      // Extract transcript from message.transcript (top level, NOT artifact)
      // This is the PRIMARY path for end-of-call-report webhooks
      if (!body.transcript && message.transcript) {
        body.transcript = message.transcript;
      }
      
      // Fallback to other transcript sources (for other webhook types)
      if (!body.transcript && (message.data?.transcript || message.report?.transcript)) {
        body.transcript = message.data?.transcript || message.report?.transcript;
      }
      
      // Last resort: check artifact (some older webhook formats may use this)
      if (message.artifact) {
        if (!body.transcript && message.artifact.transcript) {
          body.transcript = message.artifact.transcript;
        }
        if (!body.recordingUrl && message.artifact.recordingUrl) {
          body.recordingUrl = message.artifact.recordingUrl;
        }
      }
      
      if (!body.structuredOutput && (message.structuredOutput || message.data?.structuredOutput)) {
        body.structuredOutput = message.structuredOutput || message.data?.structuredOutput;
      }
      if (!body.recordingUrl && (message.recordingUrl || message.data?.recordingUrl)) {
        body.recordingUrl = message.recordingUrl || message.data?.recordingUrl;
      }
      if (!body.metadata && message.metadata) body.metadata = message.metadata;
      // VAPI end-of-call-report sends endedReason, not outcome - capture it for mapping below
      if (message.endedReason != null) body.endedReason = message.endedReason;
      if (message.call?.endedReason != null) body.endedReason = body.endedReason ?? message.call.endedReason;
    }
    if (body.call?.endedReason != null) body.endedReason = body.endedReason ?? body.call.endedReason;
    if (body.endedReason == null && body.endOfCallReport?.endedReason != null) body.endedReason = body.endOfCallReport.endedReason;

    // conversation-update: accumulate messages for use in end-of-call-report (message.call.messages is undefined there)
    if (body?.message?.type === 'conversation-update') {
      const cid = body?.message?.call?.id;
      const messages = body?.message?.messages || body?.message?.conversation;
      if (cid && Array.isArray(messages) && messages.length > 0) {
        if (!callStore.has(cid)) callStore.set(cid, []);
        callStore.get(cid).push(...messages);
        if (callStore.size > CALL_STORE_MAX) {
          const firstKey = callStore.keys().next().value;
          callStore.delete(firstKey);
        }
        console.log(`[${correlationId}] [CONVERSATION-UPDATE] Accumulated ${messages.length} msgs for ${cid}, total: ${callStore.get(cid).length}`);
      }
      // Mark durable record as processed (we don't run heavy downstream work for conversation-update).
      await markWebhookEventProcessed({ provider: 'vapi', eventId });
      res.status(200).json({ ok: true, received: true });
      return;
    }

    // Always return 200 to prevent VAPI from retrying
    res.status(200).json({ ok: true, received: true });

    // Run all downstream processing in try/catch so failures are logged and don't cause unhandled rejection
    (async () => {
      try {
        await markWebhookEventProcessingStarted({ provider: 'vapi', eventId });
        await processWebhookPayload(body, correlationId);
        await markWebhookEventProcessed({ provider: 'vapi', eventId });
      } catch (err) {
        console.error(`[${correlationId}] [VAPI WEBHOOK] Post-200 processing error:`, err);
        console.error(`[${correlationId}] [VAPI WEBHOOK] Stack:`, err.stack);
        try {
          await markWebhookEventFailed({ provider: 'vapi', eventId, error: err });
        } catch (_) {
          // best effort
        }
      }
    })();
  } catch (err) {
    console.error(`[${correlationId}] [VAPI WEBHOOK] Handler error (before 200):`, err);
    if (!res.headersSent) res.status(500).json({ ok: false, error: err.message });
  }
});

async function processWebhookPayload(body, correlationId) {
    // --- Normalize Vapi message wrapper ---
    const msg = body.message || {};
    if (msg.type && !body.type) body.type = msg.type;
    if (msg.analysis && !body.analysis) body.analysis = msg.analysis;
    if (msg.call && !body.call) body.call = msg.call;
    if (msg.call?.analysis && !body.analysis) body.analysis = msg.call.analysis;
    // ---------------------------------------

    const callObj = body.call || msg?.call || {};

    // EOCR debug: prove what structuredData looks like at webhook time
    if (body.type === 'end-of-call-report' || msg.type === 'end-of-call-report') {
      const sd = callObj?.analysis?.structuredData ?? body.analysis?.structuredData ?? {};
      vapiWebhookVerboseLog('[EOCR DEBUG] callId:', callObj?.id);
      vapiWebhookVerboseLog('[EOCR DEBUG] status:', callObj?.status, 'endedAt:', callObj?.endedAt);
      vapiWebhookVerboseLog('[EOCR DEBUG] structuredData:', sd);
      vapiWebhookVerboseLog('[EOCR DEBUG] structuredDataKeys:', Object.keys(sd ?? {}));
    }

    const callId = body.call?.id || body.id || body.callId || body.message?.call?.id || body.message?.callId;
    let status = body.call?.status || body.status;
    let outcome = body.call?.outcome || body.outcome;
    const endedReason = body.endedReason || body.call?.endedReason || body.message?.endedReason;
    /*
     * Vapi often sends call.outcome as "failed" while endedReason is specific (e.g. customer-did-not-answer).
     * Previously we only mapped endedReason when outcome was empty — so the feed showed "Failed" for many no-answers.
     * When outcome is a generic failure label, prefer mapVapiEndedReasonToOutcome. Keep explicit assistant outcomes
     * (booked, interested, completed, no-answer, voicemail, etc.).
     */
    if (endedReason) {
      const fromEnded = mapVapiEndedReasonToOutcome(endedReason);
      const oNorm = String(outcome ?? '').trim().toLowerCase();
      const genericTelephony = !oNorm || ['failed', 'error', 'unknown'].includes(oNorm);
      const assistantSetUseful = oNorm && !genericTelephony;
      if (!assistantSetUseful && fromEnded) {
        outcome = fromEnded;
        if (status === 'initiated' || !status) status = 'ended';
        if (callId) {
          console.log(`[${correlationId}] [VAPI WEBHOOK] Outcome from endedReason: callId=${callId} endedReason=${endedReason} outcome=${outcome} status=${status}`);
        }
      }
    }

    // Release VAPI concurrency slot when the call is known to have ended.
    // In practice, Vapi does not always deliver end-of-call-report reliably/quickly,
    // but it often sends call.status='ended' and/or call.endedAt on other webhook types.
    const isEndOfCallReport = body.type === 'end-of-call-report' || body.message?.type === 'end-of-call-report';
    const endedAt = body.call?.endedAt || body.endedAt || body.call?.endTime || body.endTime;
    const statusNorm = String(status || '').trim().toLowerCase();
    const looksEnded =
      isEndOfCallReport ||
      statusNorm === 'ended' ||
      statusNorm === 'completed' ||
      (!!endedAt) ||
      // endedReason is only meaningful at end-of-call; treat it as a strong signal.
      (!!endedReason && (statusNorm === 'initiated' || !statusNorm));
    if (callId && looksEnded) {
      try {
        const { releaseVapiSlot } = await import('../lib/instant-calling.js');
        releaseVapiSlot({ callId, reason: isEndOfCallReport ? 'end_of_call_report' : 'call_ended_signal' });
      } catch (e) {
        console.warn('[VAPI CONCURRENCY] Failed to release slot from webhook:', e?.message || e);
      }
    }
    const duration = body.call?.duration || body.duration;
    const cost = body.call?.cost || body.cost;
    const metadata = body.call?.metadata || body.metadata || {};
    
    // Extract transcript and recording (NEW)
    // Capture transcript from multiple possible VAPI payload shapes
    // PRIMARY: accumulated from conversation-update (message.call.messages is undefined in end-of-call-report)
    // FALLBACK: message.transcript, body.transcript, etc.
    let transcript = body.transcript || 
                    body.message?.transcript ||
                    body.call?.transcript || 
                    body.summary || '';
    const eocrTranscript = body.endOfCallReport?.transcript || body.call?.endOfCallReport?.transcript || body.end_of_call_report?.transcript;
    if (!transcript && eocrTranscript) transcript = eocrTranscript;

    // Use accumulated messages from conversation-update (VAPI sends incrementally, not in end-of-call-report)
    if (isEndOfCallReport && callId && callStore.has(callId)) {
      const fullMessages = callStore.get(callId);
      callStore.delete(callId);
      const fullTranscript = formatMessagesToTranscript(fullMessages);
      if (fullTranscript && fullTranscript.length > (transcript?.length || 0)) {
        transcript = fullTranscript;
        console.log(`[${correlationId}] [TRANSCRIPT] Using accumulated conversation-update transcript, length: ${transcript.length}`);
      }
    }
    
    // Build full formatted transcript from messages array (preserves conversation structure)
    // IMPORTANT: Filter out system/instruction messages - only include actual conversation
    if (Array.isArray(body.messages) && body.messages.length > 0) {
      const formattedMessages = body.messages
        .map(m => {
          const role = m?.role || m?.type || 'unknown';
          const content = m?.content || m?.text || m?.message || m?.body || '';
          if (!content) return null;
          
          // Skip system messages, instructions, and tool/function calls
          // These are not part of the actual conversation
          if (role === 'system' || role === 'function' || role === 'tool') {
            return null;
          }
          
          // Skip messages that look like instructions/scripts (contain keywords like "TOOLS:", "CRITICAL:", etc.)
          const contentUpper = content.toUpperCase();
          if (contentUpper.includes('TOOLS:') || 
              contentUpper.includes('CRITICAL:') || 
              contentUpper.includes('FOLLOW THIS SCRIPT') ||
              contentUpper.includes('DO NOT ADD YOUR OWN') ||
              contentUpper.includes('USE ACCESS_GOOGLE_SHEET') ||
              contentUpper.includes('USE SCHEDULE_CALLBACK')) {
            return null;
          }
          
          // Format role labels for actual conversation
          // Check role in multiple possible fields and variations
          const roleLower = (role || '').toLowerCase();
          const messageRole = m?.message?.role || m?.messageRole || role;
          const messageRoleLower = (messageRole || '').toLowerCase();
          
          let label = 'AI'; // Default to AI if not clearly a user message (in calls, non-user = AI)
          
          // Check for user/customer/caller roles
          if (roleLower === 'user' || roleLower === 'customer' || roleLower === 'caller' || 
              roleLower === 'human' || roleLower === 'person' ||
              messageRoleLower === 'user' || messageRoleLower === 'customer' || messageRoleLower === 'caller' ||
              messageRoleLower === 'human' || messageRoleLower === 'person') {
            label = 'User';
          } 
          // Explicitly check for assistant/AI roles (though default is already AI)
          else if (roleLower === 'assistant' || roleLower === 'ai' || roleLower === 'bot' ||
                   messageRoleLower === 'assistant' || messageRoleLower === 'ai' || messageRoleLower === 'bot') {
            label = 'AI';
          }
          
          return `${label}: ${content}`;
        })
        .filter(Boolean)
        .join('\n\n');
      
      // Use formatted messages if it's longer/more complete than existing transcript
      if (formattedMessages && formattedMessages.length > (transcript?.length || 0)) {
        transcript = formattedMessages;
      } else if (!transcript && formattedMessages) {
        transcript = formattedMessages;
      }
    }
    
    // Fallback: if still no transcript, try simple message join (filter out system/instruction messages)
    if (!transcript && Array.isArray(body.messages)) {
      const msgText = body.messages
        .map(m => {
          const role = m?.role || m?.type || 'unknown';
          const content = m?.content || m?.text || m?.message || '';
          if (!content) return null;
          
          // Skip system messages, instructions, and tool/function calls
          if (role === 'system' || role === 'function' || role === 'tool') {
            return null;
          }
          
          // Skip messages that look like instructions/scripts
          const contentUpper = content.toUpperCase();
          if (contentUpper.includes('TOOLS:') || 
              contentUpper.includes('CRITICAL:') || 
              contentUpper.includes('FOLLOW THIS SCRIPT') ||
              contentUpper.includes('DO NOT ADD YOUR OWN') ||
              contentUpper.includes('USE ACCESS_GOOGLE_SHEET') ||
              contentUpper.includes('USE SCHEDULE_CALLBACK')) {
            return null;
          }
          
          return content;
        })
        .filter(Boolean)
        .join(' ');
      if (msgText && msgText.length > 0) transcript = msgText;
    }
    // Extract recording URL from VAPI's actual payload structure:
    // Primary: message.call.recordingUrl (actual VAPI format)
    // Fallbacks: other possible locations
    const recordingUrl = body.call?.recordingUrl || 
                        body.message?.call?.recordingUrl ||
                        body.recordingUrl || 
                        body.recording_url || 
                        body.message?.artifact?.recordingUrl ||
                        '';
    const vapiMetrics = body.call?.metrics || body.metrics || {};
    
    // Extract assistant ID from webhook payload
    const assistantId = body.call?.assistantId || body.assistant?.id || body.assistantId || metadata.assistantId || '';
    
    console.log('[VAPI WEBHOOK]', { 
      callId, 
      status, 
      outcome, 
      duration, 
      cost,
      assistantId,
      hasTranscript: !!transcript,
      transcriptLength: transcript.length,
      hasRecording: !!recordingUrl,
      metadata: Object.keys(metadata).length > 0 ? metadata : 'none',
      allBodyKeys: Object.keys(body)
    });

    // Best-effort dedupe to avoid duplicate sheet rows on retried webhooks
    if (callId && processedCallIds.has(callId)) {
      console.log('[VAPI WEBHOOK] Duplicate callId detected, skipping downstream processing:', callId);
      return;
    }

    // Resolve tenant and lead: from metadata first, then from existing call row (for end-of-call webhooks that omit metadata)
    let tenantKey = metadata.tenantKey || metadata.clientKey || '';
    let leadPhone = metadata.leadPhone || body.customer?.number || body.call?.customer?.number || body.phone || '';
    const leadName = metadata.leadName || body.customer?.name || body.call?.customer?.name || '';

    if (callId && (!tenantKey || tenantKey === 'test_client' || !leadPhone)) {
      try {
        const { query } = await import('../db.js');
        const { rows } = await query(
          'SELECT client_key, lead_phone FROM calls WHERE call_id = $1 LIMIT 1',
          [callId]
        );
        if (rows && rows[0]) {
          if (!tenantKey || tenantKey === 'test_client') tenantKey = rows[0].client_key || tenantKey;
          if (!leadPhone) leadPhone = rows[0].lead_phone || leadPhone;
          console.log('[VAPI WEBHOOK] Resolved from existing call row:', { tenantKey, leadPhone });
        }
      } catch (e) {
        console.warn('[VAPI WEBHOOK] Lookup by call_id failed:', e.message);
      }
    }
    if (!tenantKey) tenantKey = 'test_client';

    vapiWebhookVerboseLog('[VAPI WEBHOOK] ==================== COMPLETE DEBUG ====================');
    vapiWebhookVerboseLog('[VAPI WEBHOOK] 🆔 CallId:', callId);
    vapiWebhookVerboseLog('[VAPI WEBHOOK] 🏢 TenantKey components:', {
      'metadata.tenantKey': metadata.tenantKey,
      'metadata.clientKey': metadata.clientKey,
      'FINAL tenantKey': tenantKey
    });
    vapiWebhookVerboseLog('[VAPI WEBHOOK] 📞 Phone extraction:', { 
      'metadata.leadPhone': metadata.leadPhone,
      'body.customer?.number': body.customer?.number,
      'body.call?.customer?.number': body.call?.customer?.number,
      'body.phone': body.phone,
      'FINAL leadPhone': leadPhone
    });
    vapiWebhookVerboseLog('[VAPI WEBHOOK] 👤 Name:', leadName);
    vapiWebhookVerboseLog('[VAPI WEBHOOK] 📊 Status:', status);
    
    // ALWAYS store the callId for this tenant, even without phone
    // The booking endpoint will fetch phone from VAPI API using this callId
    if (callId) {
      vapiWebhookVerboseLog('[VAPI WEBHOOK] ✅✅✅ STORING CALL CONTEXT (even without phone) ✅✅✅');
      vapiWebhookVerboseLog('[VAPI WEBHOOK] Storage payload:', JSON.stringify({
        callId: callId,
        phone: leadPhone || null,
        name: leadName || null,
        metadata: {
          tenantKey: tenantKey,
          status: status,
          timestamp: Date.now()
        }
      }, null, 2));
      
      storeCallContext(callId, leadPhone || null, leadName || null, {
        tenantKey,
        status,
        timestamp: Date.now()
      });
      
      vapiWebhookVerboseLog('[VAPI WEBHOOK] ✅ STORAGE COMPLETE');
    } else {
      vapiWebhookVerboseLog('[VAPI WEBHOOK] ❌❌❌ NOT STORING - NO CALL ID ❌❌❌');
      vapiWebhookVerboseLog('[VAPI WEBHOOK] Missing data debug:', { 
        hasCallId: !!callId,
        callIdValue: callId,
        callIdType: typeof callId,
        hasLeadPhone: !!leadPhone,
        leadPhoneValue: leadPhone,
        leadPhoneType: typeof leadPhone,
        leadPhoneLength: leadPhone?.length
      });
    }
    
    // Skip only if we have nothing to store (no transcript, no status, no outcome/endedReason)
    if (!transcript && !status && !outcome && !endedReason) {
      console.log(`[${correlationId}] [VAPI WEBHOOK SKIP]`, { reason: 'no_data', tenantKey: !!tenantKey, leadPhone: !!leadPhone });
      return;
    }
    if (!callId && (outcome || status === 'ended')) {
      console.warn(`[${correlationId}] [VAPI WEBHOOK] End-of-call data but no callId in payload - dashboard will show "Result not received". Body keys:`, Object.keys(body || {}), 'body.call:', !!body?.call, 'body.message?.call:', !!body?.message?.call);
    }

    // Load tenant config (per-client settings)
    const tenant = tenantKey ? await store.getFullClient(tenantKey).catch(() => null) : null;

    // Analyze call quality (NEW)
    const analysis = analyzeCall({
      outcome,
      duration,
      transcript,
      metrics: {
        talk_time_ratio: vapiMetrics.talk_time_ratio,
        interruptions: vapiMetrics.interruptions,
        response_time_avg: vapiMetrics.response_time_avg,
        completion_rate: vapiMetrics.completion_rate
      }
    });
    
    console.log('[CALL ANALYSIS]', {
      callId,
      sentiment: analysis.sentiment,
      qualityScore: analysis.qualityScore,
      keyPhrases: analysis.keyPhrases.slice(0, 3)
    });
    vapiWebhookVerboseLog('[CALL ANALYSIS] objections:', analysis.objections);

    // Persist endedReason on the call row so transcript UI can show who hung up (Vapi does not always put it in call.metadata).
    const baseMeta =
      typeof metadata === 'object' && metadata != null && !Array.isArray(metadata) ? { ...metadata } : {};
    if (endedReason) baseMeta.endedReason = endedReason;
    const metadataForStore = Object.keys(baseMeta).length > 0 ? baseMeta : metadata;

    // Update call tracking in database with quality data
    await updateCallTracking({
      callId,
      tenantKey,
      leadPhone,
      status,
      outcome,
      endedReason,
      duration,
      cost,
      metadata: metadataForStore,
      timestamp: new Date().toISOString(),
      // Quality data (NEW)
      transcript,
      recordingUrl,
      sentiment: analysis.sentiment,
      qualityScore: analysis.qualityScore,
      objections: analysis.objections,
      keyPhrases: analysis.keyPhrases,
      metrics: vapiMetrics,
      analyzedAt: analysis.analyzedAt
    });

    if (tenantKey && leadPhone) {
      try {
        const { recordOutboundAbLivePickups } = await import('../db.js');
        await recordOutboundAbLivePickups({
          clientKey: tenantKey,
          leadPhone,
          metadata,
          outcome,
          endedReason,
          durationSeconds: duration
        });
      } catch (livePuErr) {
        console.warn('[OUTBOUND AB LIVE PICKUP] skipped:', livePuErr?.message || livePuErr);
      }
    }

    await recordReceptionistTelemetry({
      evt: 'receptionist.call_webhook',
      tenant: tenantKey,
      callId,
      callPurpose: metadata.callPurpose || metadata.CallPurpose || null,
      intentHints: metadata.intentHints || metadata.IntentHints || [],
      status,
      outcome,
      duration,
      cost,
      toolCallCount: Array.isArray(body.toolCalls || body.call?.toolCalls || body.message?.toolCalls) ? (body.toolCalls || body.call?.toolCalls || body.message?.toolCalls || []).length : 0,
      qualityScore: analysis.qualityScore,
      sentiment: analysis.sentiment
    });

    // Handle tool calls from VAPI assistant
    // Check multiple possible locations for toolCalls
    const toolCalls = body.toolCalls || body.call?.toolCalls || body.message?.toolCalls || [];
    
    vapiWebhookVerboseLog('[VAPI WEBHOOK] Tool calls check:', {
      'body.toolCalls': !!body.toolCalls,
      'body.call?.toolCalls': !!body.call?.toolCalls,
      'body.message?.toolCalls': !!body.message?.toolCalls,
      'final toolCalls length': toolCalls.length,
      'toolCalls': toolCalls
    });
    
    if (toolCalls && toolCalls.length > 0) {
      vapiWebhookVerboseLog('[VAPI WEBHOOK] Processing tool calls:', toolCalls.length);
      
      // Import function handlers
      const { handleVapiFunctionCall } = await import('../lib/vapi-function-handlers.js');
      
      for (const toolCall of toolCalls) {
        try {
          const functionName = toolCall.function.name;
          const functionArgs = JSON.parse(toolCall.function.arguments || '{}');
          
          // Handle new receptionist functions
          if ([
            'lookup_customer',
            'lookup_appointment',
            'get_upcoming_appointments',
            'reschedule_appointment',
            'cancel_appointment',
            'get_business_info',
            'get_business_hours',
            'get_services',
            'answer_question',
            'take_message'
          ].includes(functionName)) {
            
            const result = await handleVapiFunctionCall({
              functionName,
              arguments: functionArgs,
              metadata: {
                clientKey: tenantKey,
                callId: callId,
                leadPhone: leadPhone,
                ...metadata
              }
            });
            
            console.log('[VAPI WEBHOOK] Function result:', {
              function: functionName,
              success: result.success
            });

            await recordReceptionistTelemetry({
              evt: 'receptionist.tool_call',
              tenant: tenantKey,
              callId,
              callPurpose: metadata.callPurpose || metadata.CallPurpose || null,
              function: functionName,
              success: result.success
            });
            
            continue;
          }
          
          // Handle calendar_checkAndBook - we have the customer phone in the webhook!
          if (functionName === 'calendar_checkAndBook') {
            vapiWebhookVerboseLog('[VAPI WEBHOOK] 🔧 Intercepting calendar_checkAndBook - customer phone:', leadPhone);
            
            // Add phone to function args from webhook data
            const argsWithPhone = {
              ...functionArgs,
              lead: {
                ...(functionArgs.lead || {}),
                phone: leadPhone || functionArgs.lead?.phone || '',
                name: functionArgs.lead?.name || functionArgs.customerName || ''
              },
              customerPhone: leadPhone || functionArgs.customerPhone || '',
              phone: leadPhone || functionArgs.phone || ''
            };
            
            vapiWebhookVerboseLog('[VAPI WEBHOOK] 📞 Enhanced args with phone:', JSON.stringify(argsWithPhone, null, 2));
            
            // Defer HTTP booking call so webhook processing yields sooner (Vapi already got HTTP 200).
            setImmediate(() => {
              void (async () => {
                try {
                  const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'http://localhost:3000';
                  const bookingResponse = await fetch(`${PUBLIC_BASE_URL}/api/calendar/check-book`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'X-Client-Key': tenantKey,
                      'X-Call-Id': callId || '',
                      'X-Customer-Phone': leadPhone || ''
                    },
                    body: JSON.stringify(argsWithPhone)
                  });
                  const bookingResult = await bookingResponse.json();
                  vapiWebhookVerboseLog('[VAPI WEBHOOK] ✅ Booking result:', bookingResult);
                } catch (error) {
                  console.error('[VAPI WEBHOOK] ❌ Error calling booking endpoint:', error);
                }
              })();
            });
            return { ok: true, deferred: true };
          }
          
          // Legacy functions (keep existing logic)
          if (toolCall.function.name === 'access_google_sheet') {
            console.log('[VAPI WEBHOOK] Processing access_google_sheet tool call');
            console.log('[VAPI WEBHOOK] Raw arguments:', toolCall.function.arguments);
            console.log('[VAPI WEBHOOK] Arguments type:', typeof toolCall.function.arguments);
            
            // Parse arguments - handle both string and object formats
            let args;
            try {
              if (typeof toolCall.function.arguments === 'string') {
                args = JSON.parse(toolCall.function.arguments);
              } else if (typeof toolCall.function.arguments === 'object' && toolCall.function.arguments !== null) {
                args = toolCall.function.arguments;
              } else {
                console.error('[VAPI WEBHOOK] Invalid arguments format:', toolCall.function.arguments);
                throw new Error('Invalid arguments format for access_google_sheet');
              }
            } catch (parseError) {
              console.error('[VAPI WEBHOOK] Failed to parse arguments:', parseError);
              console.error('[VAPI WEBHOOK] Arguments value:', toolCall.function.arguments);
              throw parseError;
            }
            
            console.log('[VAPI WEBHOOK] Parsed arguments:', JSON.stringify(args, null, 2));
            const { action, data } = args;
            
            console.log('[VAPI WEBHOOK] Extracted action:', action);
            console.log('[VAPI WEBHOOK] Extracted data:', JSON.stringify(data, null, 2));
            
            // Get tenant configuration
            const logisticsSheetId = tenant?.vapi?.logisticsSheetId || tenant?.gsheet_id || process.env.LOGISTICS_SHEET_ID;
            
            console.log('[VAPI WEBHOOK] Logistics sheet ID:', logisticsSheetId);
            
            if (logisticsSheetId) {
              if (action === 'append' && data) {
                // Do NOT append on function-call — structuredData only exists at end-of-call-report.
                // Appending here causes partial data (from tool args) and gaps.
                console.log('[VAPI WEBHOOK] Skipping access_google_sheet append — only append on end-of-call-report');
              } else {
                console.log('[VAPI WEBHOOK] Skipping append - action:', action, 'hasData:', !!data);
              }
            } else {
              console.error('[VAPI WEBHOOK] No logistics sheet ID configured');
            }
            
          } else if (toolCall.function.name === 'schedule_callback') {
            console.log('[VAPI WEBHOOK] Processing schedule_callback tool call');
            
            // Parse arguments - handle both string and object formats
            let args;
            try {
              if (typeof toolCall.function.arguments === 'string') {
                args = JSON.parse(toolCall.function.arguments);
              } else if (typeof toolCall.function.arguments === 'object' && toolCall.function.arguments !== null) {
                args = toolCall.function.arguments;
              } else {
                console.error('[VAPI WEBHOOK] Invalid arguments format for schedule_callback');
                throw new Error('Invalid arguments format for schedule_callback');
              }
            } catch (parseError) {
              console.error('[VAPI WEBHOOK] Failed to parse schedule_callback arguments:', parseError);
              throw parseError;
            }
            
            const { businessName, phone, receptionistName, reason, preferredTime, notes } = args;
            
            const callbackInboxEmail = tenant?.vapi?.callbackInboxEmail || process.env.CALLBACK_INBOX_EMAIL;
            
            if (callbackInboxEmail) {
              const emailSubject = `Callback Scheduled: ${businessName} - ${phone}`;
              const emailBody = `
                <h2>Callback Scheduled</h2>
                <p><strong>Business:</strong> ${businessName}</p>
                <p><strong>Phone:</strong> ${phone}</p>
                <p><strong>Receptionist:</strong> ${receptionistName || 'Unknown'}</p>
                <p><strong>Reason:</strong> ${reason}</p>
                <p><strong>Preferred Time:</strong> ${preferredTime || 'Not specified'}</p>
                <p><strong>Notes:</strong> ${notes || 'None'}</p>
                <p><strong>Call ID:</strong> ${callId || 'N/A'}</p>
                <p><strong>Recording:</strong> <a href="${recordingUrl || 'N/A'}">Listen to call</a></p>
              `;
              
              setImmediate(() => {
                void messagingService.sendEmail({
                  to: callbackInboxEmail,
                  subject: emailSubject,
                  html: emailBody
                }).then(() => {
                  vapiWebhookVerboseLog('[VAPI WEBHOOK] Callback email sent via tool call');
                }).catch((err) => {
                  console.error('[VAPI WEBHOOK] Callback email failed:', err?.message || err);
                });
              });
            }
          }
          
        } catch (error) {
          console.error('[VAPI WEBHOOK] Error processing tool call:', error);
        }
      }
    }

    // Logistics extraction (only if configured and we have transcript or structured output)
    // Prefer per-tenant configuration, fall back to env, then hardcoded test sheet
    const logisticsSheetId = tenant?.vapi?.logisticsSheetId || tenant?.gsheet_id || process.env.LOGISTICS_SHEET_ID || '1Tnll3FXtNEERYdGHTOh4VtAn90FyG6INUIU46ZbsP6g';
    
    // Only process logistics extraction for the specific assistant ID
    const ALLOWED_LOGISTICS_ASSISTANT_IDS = new Set([
      'b19a474b-49f3-474d-adb2-4aacc6ad37e7', // original assistant
      'b1ba0ad3-c519-4ab7-aa6f-9fba6516a0ee', // Tom D2D (variant)
      'b1ba0ad3-c519-4ab7-aa6f-9fba6516a8ee'  // Tom D2D (from diagnostic)
    ]);
    
    vapiWebhookVerboseLog('[LOGISTICS SHEET ID DEBUG]', {
      'tenant?.vapi?.logisticsSheetId': tenant?.vapi?.logisticsSheetId,
      'tenant?.gsheet_id': tenant?.gsheet_id,
      'process.env.LOGISTICS_SHEET_ID': process.env.LOGISTICS_SHEET_ID,
      'Final logisticsSheetId': logisticsSheetId,
      'assistantId': assistantId,
      'allowedAssistantIds': [...ALLOWED_LOGISTICS_ASSISTANT_IDS],
      'assistantMatches': ALLOWED_LOGISTICS_ASSISTANT_IDS.has(assistantId),
      'Has transcript': !!transcript,
      'Transcript length': transcript.length,
      'Status': status,
      'Will update sheet': !!(logisticsSheetId && transcript && transcript.length > 100)
    });
    
    // CRITICAL DEBUG: Log exact condition check
    if (!logisticsSheetId) {
      vapiWebhookVerboseLog('[LOGISTICS SKIP] No sheet ID configured');
    }
    if (!transcript || transcript.length < 50) {
      vapiWebhookVerboseLog('[LOGISTICS SKIP] No meaningful transcript available:', { hasTranscript: !!transcript, length: transcript?.length });
    }
    if (assistantId && !ALLOWED_LOGISTICS_ASSISTANT_IDS.has(assistantId)) {
      vapiWebhookVerboseLog('[LOGISTICS SKIP] Assistant ID mismatch - not processing logistics extraction:', {
        received: assistantId,
        expected: [...ALLOWED_LOGISTICS_ASSISTANT_IDS]
      });
    }
    
    // Check for structured output data from VAPI
    // MODERN PATH (Structured Output / artifactPlan): call.artifact.structuredOutputs
    // OLD PATH (analysisPlan.structuredDataPlan): call.analysis.structuredData
    const artifactOutputs = callObj.artifact?.structuredOutputs
      || body.message?.call?.artifact?.structuredOutputs
      || body.artifact?.structuredOutputs
      || [];
    const artifactStructured = Array.isArray(artifactOutputs) && artifactOutputs.length > 0
      ? (artifactOutputs[0]?.result ?? artifactOutputs[0] ?? {})
      : {};
    const hasArtifactStructured = artifactStructured && typeof artifactStructured === 'object' && Object.keys(artifactStructured).length > 0;

    const analysisStructured =
      (body.type === 'end-of-call-report' || msg?.type === 'end-of-call-report')
        ? (body.analysis?.structuredData ?? msg?.analysis?.structuredData ?? msg?.call?.analysis?.structuredData ?? body.call?.analysis?.structuredData ?? {})
        : {};
    const hasAnalysisStructured = analysisStructured && Object.keys(analysisStructured).length > 0;
    const legacyStructured = body.call?.structuredOutput || body.structuredOutput || body.structured_output;

    // Prefer artifact.structuredOutputs (modern Structured Output), then analysis.structuredData, then legacy
    const structuredOutput = hasArtifactStructured ? artifactStructured : (hasAnalysisStructured ? analysisStructured : legacyStructured);
    
    // Debug: Log what VAPI is sending (including artifact path for Structured Output)
    vapiWebhookVerboseLog('[LOGISTICS DEBUG] Status received:', status);
    if (body.type === 'end-of-call-report' || msg?.type === 'end-of-call-report') {
      vapiWebhookVerboseLog('STRUCTURED OUTPUTS (artifact path):', JSON.stringify(artifactOutputs, null, 2));
      vapiWebhookVerboseLog('[LOGISTICS DEBUG] call.artifact:', JSON.stringify(callObj?.artifact, null, 2));
    }
    vapiWebhookVerboseLog('[LOGISTICS DEBUG] Structured output:', JSON.stringify(structuredOutput, null, 2));
    vapiWebhookVerboseLog('[LOGISTICS DEBUG] Transcript length:', transcript.length);
    vapiWebhookVerboseLog('[LOGISTICS DEBUG] Transcript present sources:', {
      call_transcript: !!(body.call?.transcript),
      body_transcript: !!(body.transcript),
      body_summary: !!(body.summary),
      eocr_transcript: !!eocrTranscript,
      messages_aggregated: Array.isArray(body.messages)
    });
    vapiWebhookVerboseLog('[LOGISTICS DEBUG] Extract if transcript exists and has content:', !!(transcript && transcript.length >= 50));
    vapiWebhookVerboseLog('[LOGISTICS DEBUG] GOOGLE_SA_JSON_BASE64 configured:', !!process.env.GOOGLE_SA_JSON_BASE64);
    
    // Extract when we have a transcript (minimum 50 chars to avoid noise from connection-only webhooks)
    // Track extracted call IDs to prevent duplicates
    const hasTranscript = transcript && transcript.length >= 50;
    const hasStructuredData = structuredOutput && Object.keys(structuredOutput).length > 0;
    
    // Only proceed if assistant ID exists and matches the allowed one
    const assistantMatches = ALLOWED_LOGISTICS_ASSISTANT_IDS.has(assistantId);
    const noUsefulOutcome = ['no-answer', 'busy', 'declined', 'rejected'].includes(outcome);

    vapiWebhookVerboseLog('[LOGISTICS CONDITION CHECK]', {
      eventType: body.type || msg.type,
      isEndOfCallReport,
      logisticsSheetId: !!logisticsSheetId,
      hasTranscript,
      transcriptLength: transcript?.length || 0,
      hasStructuredData,
      assistantMatches,
      assistantId,
      willExtract: !!(isEndOfCallReport && logisticsSheetId && (hasTranscript || hasStructuredData) && assistantMatches)
    });
    
    // CRITICAL: Only append on end-of-call-report. structuredData only exists there.
    if (!isEndOfCallReport) {
      vapiWebhookVerboseLog('[LOGISTICS SKIP] Not end-of-call-report — structured extraction only runs on that event');
    }

    // Defer manual structured-output fetch, Google Sheets I/O, and callback emails so post-200 work yields sooner.
    setImmediate(() => {
      void (async () => {
    // WORKAROUND: When artifact is suppressed, call VAPI /structured-output/run to force extraction from transcript
    let manualStructuredOutput = null;
    if (isEndOfCallReport && callId && hasTranscript && !hasStructuredData && process.env.VAPI_PRIVATE_KEY) {
      try {
        vapiWebhookVerboseLog('[LOGISTICS] Running manual structured extraction for call:', callId);
        const res = await fetch('https://api.vapi.ai/structured-output/run', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.VAPI_PRIVATE_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            callIds: [callId],
            structuredOutputId: process.env.VAPI_STRUCTURED_OUTPUT_ID || '0cff18e4-6a16-4573-a713-cc7e0fcf3e06',
            previewEnabled: true
          })
        });
        const data = await res.json();
        vapiWebhookVerboseLog('[LOGISTICS] Structured Output Run Response:', JSON.stringify(data, null, 2));
        manualStructuredOutput = data?.results?.[0]?.output ?? null;
        if (manualStructuredOutput && typeof manualStructuredOutput === 'object' && Object.keys(manualStructuredOutput).length > 0) {
          vapiWebhookVerboseLog('[LOGISTICS] MANUAL STRUCTURED RESULT:', JSON.stringify(manualStructuredOutput, null, 2));
        }
      } catch (err) {
        console.error('[LOGISTICS] Structured extraction failed:', err);
      }
    }
    
    const effectiveStructuredOutput = manualStructuredOutput || structuredOutput;
    const effectiveHasStructuredData = (manualStructuredOutput && Object.keys(manualStructuredOutput).length > 0) || hasStructuredData;
    
    // Don't create sheet rows when they didn't pick up (or call couldn't connect)
    // Note: VAPI sometimes uses "rejected" directly; we also map endedReason→outcome above.
    if (noUsefulOutcome) {
      vapiWebhookVerboseLog('[LOGISTICS SHEET] Skipping sheet write — outcome indicates no useful call:', outcome);
    }
    
    if (isEndOfCallReport && logisticsSheetId && (hasTranscript || effectiveHasStructuredData) && assistantMatches && !noUsefulOutcome) {
      vapiWebhookVerboseLog('STRUCTURED DATA RECEIVED:', JSON.stringify(effectiveStructuredOutput, null, 2));
      vapiWebhookVerboseLog('[LOGISTICS] STARTING EXTRACTION...');
      try {
        // Use structured output if available, otherwise fall back to transcript extraction
        // SOURCE PRIORITY: 1) manual API (workaround), 2) artifact, 3) analysis, 4) transcript
        let extracted;
        if (effectiveHasStructuredData && effectiveStructuredOutput) {
          // Map from VAPI schema keys (artifact.result / analysis.structuredData / manual API) or camelCase fallbacks
          const s = effectiveStructuredOutput;
          const inc = s['Includes Fuel & VAT (Y/N)'] || s.includesFuelVat || '';
          const exclFromInc = inc === 'Y' ? 'N' : inc === 'N' ? 'Y' : s['Excl Fuel & VAT?'] || s.exclFuelVAT || '';
          extracted = {
            email: s['Email'] || s.email || '',
            international: s['International (Y/N)'] || s.international || s.internationalYN || '',
            mainCouriers: s['International Courier'] || s['Main Couriers'] || s.mainCouriers || (Array.isArray(s.mainCouriers) ? s.mainCouriers.join(', ') : ''),
            frequency: s['International Shipments per Week'] || s['Frequency'] || s.frequency || '',
            internationalShipmentsPerWeek: s['International Shipments per Week'] || s.internationalShipmentsPerWeek || '',
            mainCountries: s['Main Countries'] || s.mainCountries || (Array.isArray(s.mainCountries) ? s.mainCountries.join(', ') : ''),
            exampleShipment: s['Example Shipment Weight'] || s['Example Shipment (weight x dims)'] || s.exampleShipment || '',
            exampleShipmentCost: s['Example Shipment Cost'] || s.exampleShipmentCost || '',
            domesticFrequency: s['UK Shipments per Week'] || s['Domestic Frequency'] || s.domesticFrequency || '',
            ukShipmentsPerWeek: s['UK Shipments per Week'] || s.ukShipmentsPerWeek || '',
            ukCourier: s['UK Courier'] || s.ukCourier || '',
            standardRateUpToKg: s['UK Standard Rate'] || s['Std Rate up to KG'] || s.standardRateUpToKg || '',
            excludingFuelVat: exclFromInc || s['Excl Fuel & VAT?'] || s.exclFuelVAT || '',
            singleVsMulti: s['Single vs Multi-parcel'] || s.singleVsMulti || s.singleVsMultiParcel || ''
          };
          vapiWebhookVerboseLog('[LOGISTICS] Using structured output (artifact or analysis):', JSON.stringify(extracted, null, 2));
        } else {
          // Use human-only transcript for regex extraction to avoid contamination from assistant prompts/menus
          const humanOnlyTranscript = (() => {
            if (!transcript || typeof transcript !== 'string') return transcript;
            const lines = transcript.split(/\r?\n/);
            const humanLines = lines.filter(l => /^\s*User:/i.test(l) || /^\s*Caller:/i.test(l));
            if (humanLines.length === 0) return transcript;
            return humanLines
              .map(l => l.replace(/^\s*(User|Caller):\s*/i, ''))
              .join('\n');
          })();
          const humanOnlyLower = (humanOnlyTranscript || '').toLowerCase();
          const isLikelyIVROnly = (() => {
            if (!humanOnlyLower) return true;
            // Common IVR / switchboard / voicemail prompts that are not "info gained"
            const ivrHints = [
              'press', 'for sales', 'for accounts', 'for logistics', 'options again',
              'extension', 'please wait', 'calls may be recorded', 'training and quality',
              'leave a message', 'after the tone', 'hash key', 'recording at the tone',
              'busy', 'inquiries', 'website', 'frequently asked questions'
            ];
            const hasIvrHint = ivrHints.some(h => humanOnlyLower.includes(h));
            // If it’s short and contains IVR hints, treat as IVR-only.
            return hasIvrHint && humanOnlyLower.length < 220;
          })();

          if (effectiveStructuredOutput) {
            vapiWebhookVerboseLog('[LOGISTICS] Using legacy structured output data:', JSON.stringify(effectiveStructuredOutput, null, 2));
            // Transform legacy structured output to match our expected format
            extracted = {
              email: effectiveStructuredOutput.email || '',
              international: effectiveStructuredOutput.internationalYN || '',
              mainCouriers: [effectiveStructuredOutput.courier1, effectiveStructuredOutput.courier2, effectiveStructuredOutput.courier3].filter(Boolean),
              frequency: effectiveStructuredOutput.frequency || '',
              mainCountries: [effectiveStructuredOutput.country1, effectiveStructuredOutput.country2, effectiveStructuredOutput.country3].filter(Boolean),
              exampleShipment: effectiveStructuredOutput.exampleShipment || '',
              exampleShipmentCost: effectiveStructuredOutput.exampleShipmentCost || '',
              domesticFrequency: effectiveStructuredOutput.domesticFrequency || '',
              ukCourier: effectiveStructuredOutput.ukCourier || '',
              standardRateUpToKg: effectiveStructuredOutput.standardRateUpToKg || '',
              excludingFuelVat: effectiveStructuredOutput.exclFuelVAT || '',
              singleVsMulti: effectiveStructuredOutput.singleVsMultiParcel || ''
            };
            
            // Fill in gaps from human transcript if structured output is incomplete
            const transcriptExtracted = extractLogisticsFields(humanOnlyTranscript);
            Object.keys(extracted).forEach(key => {
              if (!extracted[key] && transcriptExtracted[key]) {
                extracted[key] = transcriptExtracted[key];
              }
            });
          } else {
            vapiWebhookVerboseLog('[LOGISTICS] Using transcript extraction (no structured output)');
            extracted = extractLogisticsFields(humanOnlyTranscript);
          }

          // If the "human" side is just IVR/menu text, don't let it trigger callbackNeeded or row appends.
          if (isLikelyIVROnly) {
            extracted.__ivrOnly = true;
          }
        }

        // Prefer analysis.structuredData (from VAPI end-of-call-report) when it contains real values,
        // otherwise fall back to extracted/transcript. This avoids writing rows full of "Unknown".
        const sd = callObj?.analysis?.structuredData || body.analysis?.structuredData || {};
        const sdHasAnyKeys = sd && Object.keys(sd).length > 0;
        const sdHasMeaningfulValue = (() => {
          if (!sdHasAnyKeys) return false;
          for (const v of Object.values(sd)) {
            if (v == null) continue;
            if (typeof v === 'string' && v.trim() !== '') return true;
            if (typeof v === 'number' && Number.isFinite(v)) return true;
            if (typeof v === 'boolean') return true;
            if (Array.isArray(v) && v.filter(Boolean).length > 0) return true;
            if (typeof v === 'object' && Object.keys(v).length > 0) return true;
          }
          return false;
        })();

        // Prefer artifact transcript and call recordingUrl, with safe defaults for Sheets
        const transcriptSource = String(callObj?.artifact?.transcript ?? callObj?.transcript ?? transcript ?? '');
        const transcriptSnippet = transcriptSource.slice(0, 500);
        const effectiveRecordingUrl = String(callObj?.recordingUrl ?? callObj?.artifact?.recordingUrl ?? recordingUrl ?? '');

        let sheetData;

        if (sdHasMeaningfulValue) {
          // Primary path: use structuredData from analysisPlan, but never write literal "Unknown"
          const asStr = (v) => (v == null ? '' : String(v).trim());
          const asJoined = (v) => Array.isArray(v) ? v.filter(Boolean).join(', ') : asStr(v);
          sheetData = {
            // Business Name = the company we called (lead). Never tenant clientKey / displayName.
            businessName: pickCalleeBusinessNameForSheet({
              tenantKey,
              metadata,
              customerName: body.call?.customer?.name,
              structuredFields: { businessName: sd.businessName, companyName: sd.companyName },
            }),
            decisionMaker: asStr(sd.decisionMaker),
            phone: asStr(sd.phone) || (leadPhone || ''),
            calledNumber: leadPhone || '',
            email: asStr(sd.email),
            international: asStr(sd.international),
            mainCouriers: asJoined(sd.mainCouriers),
            frequency: asStr(sd.frequency),
            internationalShipmentsPerWeek: asStr(sd.internationalShipmentsPerWeek),
            mainCountries: asJoined(sd.mainCountries),
            exampleShipment: asStr(sd.exampleShipment),
            exampleShipmentCost: asStr(sd.exampleShipmentCost),
            domesticFrequency: asStr(sd.domesticFrequency),
            ukShipmentsPerWeek: asStr(sd.ukShipmentsPerWeek),
            ukCourier: asStr(sd.ukCourier),
            standardRateUpToKg: asStr(sd.stdRateUpToKg),
            excludingFuelVat: asStr(sd.exclFuelVat),
            singleVsMulti: asStr(sd.singleVsMultiParcel),
            receptionistName: asStr(sd.receptionistName),
            callbackNeeded: sd.callbackNeeded ? 'TRUE' : 'FALSE',
            callId: callId || '',
            recordingUrl: effectiveRecordingUrl,
            transcriptSnippet
          };
        } else {
          // Fallback: derive from structuredOutput/extracted + transcript (existing behaviour)
          const hasStructuredSource = effectiveHasStructuredData && effectiveStructuredOutput;
          const structuredBn = hasStructuredSource
            ? (body.call?.customer?.name || '')
            : (effectiveStructuredOutput?.businessName || metadata.businessName || '');
          const decisionMaker = hasStructuredSource
            ? (effectiveStructuredOutput['Decision Maker'] || effectiveStructuredOutput.decisionMaker || '')
            : (effectiveStructuredOutput?.decisionMaker || (transcript.match(/decision\s+maker[^\n]{0,60}?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i)?.[1]) || '');
          const receptionistName = hasStructuredSource
            ? (effectiveStructuredOutput['Receptionist Name'] || effectiveStructuredOutput.receptionistName || '')
            : (effectiveStructuredOutput?.receptionistName || pickReceptionistName(transcript) || metadata.receptionistName || '');
          // Use human-only transcript to avoid assistant prompt contamination, and ignore IVR-only calls
          const ivrOnly = extracted?.__ivrOnly === true;
          const callbackNeeded = !ivrOnly && (
            effectiveStructuredOutput?.callbackNeeded === 'Y' ||
            (/call\s*back|transfer|not\s*available|not\s*in|back\s*later|try\s*again/i.test((transcript || '')) && !decisionMaker)
          );

          sheetData = {
            businessName: pickCalleeBusinessNameForSheet({
              tenantKey,
              metadata,
              customerName: body.call?.customer?.name,
              structuredFields: { businessName: structuredBn },
            }),
            decisionMaker: decisionMaker || (hasStructuredSource ? (effectiveStructuredOutput['Decision Maker'] || effectiveStructuredOutput.decisionMaker) : '') || '',
            phone: (hasStructuredSource ? (effectiveStructuredOutput['Phone Number'] || effectiveStructuredOutput.phone) : null) || leadPhone || '',
            calledNumber: leadPhone || '',
            email: extracted.email || '',
            international: extracted.international || '',
            mainCouriers: Array.isArray(extracted.mainCouriers) ? extracted.mainCouriers.join(', ') : (extracted.mainCouriers || ''),
            frequency: extracted.frequency || '',
            internationalShipmentsPerWeek: extracted.internationalShipmentsPerWeek || '',
            mainCountries: Array.isArray(extracted.mainCountries) ? extracted.mainCountries.join(', ') : (extracted.mainCountries || ''),
            exampleShipment: extracted.exampleShipment || '',
            exampleShipmentCost: extracted.exampleShipmentCost || '',
            domesticFrequency: extracted.domesticFrequency || '',
            ukShipmentsPerWeek: extracted.ukShipmentsPerWeek || '',
            ukCourier: extracted.ukCourier || '',
            standardRateUpToKg: extracted.standardRateUpToKg || '',
            excludingFuelVat: extracted.excludingFuelVat || '',
            singleVsMulti: extracted.singleVsMulti || '',
            receptionistName: receptionistName || '',
            callbackNeeded: callbackNeeded ? 'TRUE' : 'FALSE',
            callId: callId || '',
            recordingUrl: effectiveRecordingUrl,
            transcriptSnippet
          };
        }

        const hasAnyLogisticsInfo = (() => {
          // Only treat these as "info gained". We intentionally ignore: callId/recordingUrl/transcriptSnippet/phone/businessName.
          // Also: callbackNeeded alone is NOT "info gained" (IVR can trip it).
          const fields = [
            sheetData.decisionMaker,
            sheetData.email,
            sheetData.international,
            sheetData.mainCouriers,
            sheetData.internationalShipmentsPerWeek,
            sheetData.mainCountries,
            sheetData.exampleShipment,
            sheetData.exampleShipmentCost,
            sheetData.ukShipmentsPerWeek,
            sheetData.ukCourier,
            sheetData.standardRateUpToKg,
            sheetData.excludingFuelVat,
            sheetData.singleVsMulti,
            sheetData.receptionistName
          ];
          return fields.some(v => typeof v === 'string' ? v.trim() !== '' : !!v);
        })();
        
        vapiWebhookVerboseLog('[LOGISTICS SHEET DATA] Writing to sheet:', JSON.stringify(sheetData, null, 2));
        vapiWebhookVerboseLog('[LOGISTICS SHEET] Call metadata for update:', {
          callId: callId || 'MISSING',
          recordingUrl: recordingUrl || 'MISSING',
          transcriptLength: transcript?.length || 0,
          phone: leadPhone || 'MISSING',
          hasCallId: !!callId,
          hasRecordingUrl: !!recordingUrl,
          hasTranscript: !!transcript
        });
        
        try {
          vapiWebhookVerboseLog('[LOGISTICS SHEET] Attempting to update or append to sheet:', logisticsSheetId);
          
          // First try to update existing row (created by tool call during the call)
          // Try by callId first (more reliable), then fall back to phone
          const updateData = {
            callId: callId || '',
            recordingUrl: recordingUrl || '',
            transcriptSnippet: transcript.slice(0, 500) || '',
            calledNumber: leadPhone || ''
          };
          vapiWebhookVerboseLog('[LOGISTICS SHEET] Update data:', JSON.stringify(updateData, null, 2));
          
          const updated = await sheets.updateLogisticsRowByPhone(logisticsSheetId, leadPhone, updateData);
          
          if (!updated) {
            // If no row found to update, only append if we actually gained any logistics info.
            if (!hasAnyLogisticsInfo) {
              vapiWebhookVerboseLog('[LOGISTICS SHEET] Skipping append — no logistics info gained from call', {
                callId,
                phone: leadPhone,
                outcome,
                endedReason
              });
              markProcessed(callId);
            } else {
              vapiWebhookVerboseLog('[LOGISTICS SHEET] No existing row found, appending new row');
              vapiWebhookVerboseLog('[EOCR SHEET ROW]', {
                email: sheetData.email,
                phone: sheetData.phone,
                international: sheetData.international,
                ukShipmentsPerWeek: sheetData.ukShipmentsPerWeek,
                ukCourier: sheetData.ukCourier,
                stdRateUpToKg: sheetData.standardRateUpToKg,
                exclFuelVat: sheetData.excludingFuelVat,
                singleVsMulti: sheetData.singleVsMulti,
                receptionistName: sheetData.receptionistName,
                callbackNeeded: sheetData.callbackNeeded
              });
              await sheets.appendLogistics(logisticsSheetId, sheetData);
              vapiWebhookVerboseLog('[LOGISTICS SHEET APPEND] ✅ SUCCESS', { callId, phone: leadPhone });
              // Outbound A/B: treat a successful *sheet row append* as a conversion event.
              // This aligns monitoring with "row written" rather than bookings (which may not apply to outreach).
              try {
                if (tenantKey && leadPhone) {
                  const computeCompleteness = (row) => {
                    const r = row && typeof row === 'object' ? row : {};
                    const present = (v) => {
                      if (v == null) return false;
                      if (Array.isArray(v)) return v.filter(Boolean).length > 0;
                      const s = String(v).trim();
                      return s !== '' && s.toLowerCase() !== 'unknown' && s.toLowerCase() !== 'n/a';
                    };
                    // Core fields we expect the script to capture for logistics.
                    const fields = [
                      r.email,
                      r.international,
                      r.mainCouriers,
                      r.internationalShipmentsPerWeek || r.frequency,
                      r.mainCountries,
                      r.exampleShipment,
                      r.exampleShipmentCost,
                      r.ukShipmentsPerWeek || r.domesticFrequency,
                      r.ukCourier,
                      r.standardRateUpToKg,
                      r.excludingFuelVat,
                      r.singleVsMulti,
                      r.decisionMaker
                    ];
                    const total = fields.length;
                    const filled = fields.reduce((n, v) => n + (present(v) ? 1 : 0), 0);
                    const score = total > 0 ? Math.round((filled / total) * 1000) / 10 : 0; // 0–100, one decimal
                    return { score, filled, total };
                  };
                  const completeness = computeCompleteness(sheetData);
                  const { collectOutboundAbExperimentNamesFromMetadata } = await import('../lib/outbound-ab-live-pickup.js');
                  const { recordABTestOutcome } = await import('../db.js');
                  const expNames = collectOutboundAbExperimentNamesFromMetadata(metadata);
                  for (const experimentName of expNames) {
                    await recordABTestOutcome({
                      clientKey: tenantKey,
                      experimentName,
                      leadPhone,
                      outcome: 'converted',
                      outcomeData: {
                        source: 'sheet_append',
                        sheetId: logisticsSheetId,
                        callId: callId || null,
                        completenessScore: completeness.score,
                        completenessFilled: completeness.filled,
                        completenessTotal: completeness.total
                      }
                    });
                  }
                }
              } catch (abConvErr) {
                console.warn('[OUTBOUND AB CONVERSION] skipped:', abConvErr?.message || abConvErr);
              }
              markProcessed(callId);
            }
          } else {
            vapiWebhookVerboseLog('[LOGISTICS SHEET] ✅ Updated existing row with call metadata', { callId, phone: leadPhone });
            markProcessed(callId);
          }
        } catch (sheetError) {
          console.error('[LOGISTICS SHEET APPEND ERROR] ❌ FAILED', {
            error: sheetError.message,
            errorName: sheetError.name,
            stack: sheetError.stack,
            callId,
            phone: leadPhone
          });
          throw sheetError; // Re-throw to catch it in outer handler
        }

        // Email fallback notification for callback queue (per-tenant if available)
        const callbackInbox = tenant?.vapi?.callbackInboxEmail || process.env.CALLBACK_INBOX_EMAIL;
        if (sheetData.callbackNeeded === 'TRUE' && callbackInbox) {
          const subject = `Callback needed: ${sheetData.businessName || 'Unknown business'} (${leadPhone})`;
          const body = `A receptionist requested a callback or decision maker was unavailable.\n\nBusiness: ${sheetData.businessName || 'Unknown'}\nReceptionist: ${sheetData.receptionistName || 'Unknown'}\nPhone: ${leadPhone}\nEmail: ${extracted.email || 'N/A'}\nInternational: ${extracted.international || 'N/A'}\nCouriers: ${(extracted.mainCouriers || []).join(', ') || 'N/A'}\nFrequency: ${extracted.frequency || 'N/A'}\nCountries: ${(extracted.mainCountries || []).join(', ') || 'N/A'}\nExample Shipment: ${extracted.exampleShipment || 'N/A'} (Cost: ${extracted.exampleShipmentCost || 'N/A'})\nRecording: ${recordingUrl || 'N/A'}\nCall ID: ${callId}\n\nTranscript snippet:\n${transcript.slice(0, 800)}`;
          setImmediate(() => {
            void messagingService.sendEmail({ to: callbackInbox, subject, body }).catch((err) => {
              console.error('[LOGISTICS] Callback inbox email failed:', err?.message || err);
            });
          });
        }
      } catch (sheetErr) {
        console.error('[LOGISTICS SHEET ERROR]', sheetErr?.message || sheetErr);
        await sendOperatorAlert({
          subject: `Logistics sheet sync failed (${String(tenantKey || 'unknown')})`,
          html: `<p>Vapi end-of-call logistics sheet write/update failed.</p><pre>${JSON.stringify(
            {
              tenantKey: tenantKey || null,
              callId: callId || null,
              message: sheetErr?.message,
              stack: sheetErr?.stack ? String(sheetErr.stack).split('\n').slice(0, 10).join('\n') : null
            },
            null,
            2
          )}</pre>`,
          dedupeKey: `logistics-sheet:${String(tenantKey || 'unknown')}`,
          throttleMinutes: 45
        }).catch(() => {});
      }
    } else if (logisticsSheetId && callId && (recordingUrl || transcript) && !noUsefulOutcome) {
      // Assistant ID doesn't match, but we still want to update existing rows with call metadata
      // This handles cases where the tool call created a row but assistant ID wasn't set in webhook
      vapiWebhookVerboseLog('[LOGISTICS] Assistant ID mismatch or missing, but attempting to update existing row with call metadata');
      
      try {
        vapiWebhookVerboseLog('[LOGISTICS SHEET] Attempting to update existing row by callId:', callId);
        
        const updateData = {
          callId: callId || '',
          recordingUrl: recordingUrl || '',
          transcriptSnippet: transcript ? transcript.slice(0, 500) : '',
          calledNumber: leadPhone || ''
        };
        vapiWebhookVerboseLog('[LOGISTICS SHEET] Update data:', JSON.stringify(updateData, null, 2));
        
        // Try to update by callId (phone might be empty in end-of-call webhook)
          const updated = await sheets.updateLogisticsRowByPhone(logisticsSheetId, leadPhone || '', updateData);
        
        if (updated) {
          vapiWebhookVerboseLog('[LOGISTICS SHEET] ✅ Updated existing row with call metadata (no assistant match)', { callId });
          markProcessed(callId);
        } else {
          // Never create a brand-new row in assistant-mismatch fallback path.
          // This path is metadata-only and caused Unknown-only rows.
          vapiWebhookVerboseLog('[LOGISTICS SHEET] Skipping fallback append — no existing row and assistant mismatch', {
            callId,
            phone: leadPhone,
            outcome,
            endedReason
          });
          markProcessed(callId);
        }
      } catch (updateError) {
        console.error('[LOGISTICS SHEET UPDATE ERROR] ❌ FAILED', {
          error: updateError.message,
          callId
        });
        await sendOperatorAlert({
          subject: `Logistics sheet metadata update failed (${String(tenantKey || 'unknown')})`,
          html: `<p>Assistant-mismatch fallback path could not update the sheet.</p><pre>${JSON.stringify(
            {
              tenantKey: tenantKey || null,
              callId: callId || null,
              message: updateError?.message
            },
            null,
            2
          )}</pre>`,
          dedupeKey: `logistics-sheet-update:${String(tenantKey || 'unknown')}`,
          throttleMinutes: 45
        }).catch(() => {});
      }
    }
      })().catch((deferredErr) => {
        console.error(`[${correlationId}] [VAPI WEBHOOK] Deferred logistics pipeline failed:`, deferredErr?.message || deferredErr);
        sendOperatorAlert({
          subject: `Deferred logistics pipeline failed (${String(tenantKey || 'unknown')})`,
          html: `<p>${String(deferredErr?.message || deferredErr)}</p><pre>${String(deferredErr?.stack || '').split('\n').slice(0, 15).join('\n')}</pre>`,
          dedupeKey: `deferred-logistics-pipeline:${String(tenantKey || 'unknown')}`,
          throttleMinutes: 60
        }).catch(() => {});
      });
    });

    // Handle specific outcomes
    if (outcome === 'booked' || body.booked === true) {
      await handleBookingOutcome({
        tenantKey,
        leadPhone,
        callId,
        bookingStart: body.bookingStart || body.slotStart || '',
        bookingEnd: body.bookingEnd || body.slotEnd || '',
        metadata
      });
    } else if (outcome === 'no-answer' || outcome === 'busy' || outcome === 'declined' || outcome === 'voicemail') {
      await handleFailedCall({
        tenantKey,
        leadPhone,
        callId,
        reason: outcome,
        metadata
      });
      
      // Schedule automated follow-up sequence (voicemail was missing — retries never queued for VM-only outcomes)
      const { scheduleFollowUps } = await import('../lib/follow-up-sequences.js');
      await scheduleFollowUps({
        clientKey: tenantKey,
        leadPhone,
        leadName: metadata.leadName || metadata.businessName,
        businessName: metadata.businessName,
        industry: metadata.industry,
        outcome,
        callId
      });
    } else if (status === 'completed' && (outcome === 'interested' || outcome === 'positive' || body.summary?.includes('interest') || body.summary?.includes('interested'))) {
      // Trigger SMS pipeline for interested prospects
      await handleInterestedProspect({
        tenantKey,
        leadPhone,
        callId,
        metadata,
        summary: body.summary || body.call?.summary || ''
      });
    }

    // Response already sent at the beginning
}

// Update call tracking in the database
async function updateCallTracking({ 
  callId, 
  tenantKey, 
  leadPhone, 
  status, 
  outcome,
  endedReason,
  duration, 
  cost, 
  metadata, 
  timestamp,
  // Quality data (NEW)
  transcript,
  recordingUrl,
  sentiment,
  qualityScore,
  objections,
  keyPhrases,
  metrics,
  analyzedAt
}) {
  try {
    // Import database functions
    const { upsertCall, trackCost } = await import('../db.js');
    
    // Store call data with quality metrics in database
    await upsertCall({
      callId,
      clientKey: tenantKey,
      leadPhone,
      status,
      outcome,
      duration,
      cost,
      metadata,
      // Quality fields (NEW)
      transcript,
      recordingUrl,
      sentiment,
      qualityScore,
      objections,
      keyPhrases,
      metrics,
      analyzedAt
    });

    if (tenantKey && leadPhone && String(status || '').toLowerCase() === 'ended') {
      try {
        const meta = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {};
        const cp = String(meta.callPurpose || meta.CallPurpose || '').toLowerCase();
        if (!cp.startsWith('inbound')) {
          const { isOutboundAbLivePickupOutcome } = await import('../lib/outbound-ab-live-pickup.js');
          if (isOutboundAbLivePickupOutcome(outcome, endedReason)) {
            const { closeOutboundWeekdayJourneyOnLivePickup } = await import('../db.js');
            await closeOutboundWeekdayJourneyOnLivePickup(tenantKey, leadPhone);
          }
        }
      } catch (journeyErr) {
        console.warn('[OUTBOUND WEEKDAY JOURNEY] close on live pickup skipped:', journeyErr?.message || journeyErr);
      }
    }

    try {
      const { recordCallTimeBanditAfterCallComplete } = await import('../db.js');
      await recordCallTimeBanditAfterCallComplete({ clientKey: tenantKey, callId });
    } catch (banditErr) {
      console.warn('[CALL TIME BANDIT] webhook update skipped:', banditErr?.message || banditErr);
    }
    
    // Track cost if available
    if (cost && cost > 0) {
      await trackCost({
        clientKey: tenantKey,
        callId,
        costType: 'vapi_call',
        amount: cost,
        currency: 'USD',
        description: `VAPI call ${status} - ${outcome || 'unknown outcome'}`,
        metadata: {
          duration,
          outcome,
          leadPhone,
          timestamp
        }
      });
      
      console.log('[COST TRACKED]', {
        callId,
        tenantKey,
        cost: `$${cost}`,
        type: 'vapi_call'
      });
    }
    
    console.log('[CALL TRACKING UPDATE]', {
      callId,
      tenantKey,
      leadPhone,
      status,
      outcome,
      duration: duration ? `${duration}s` : 'unknown',
      qualityScore: qualityScore || 'not scored',
      sentiment: sentiment || 'unknown',
      cost: cost ? `$${cost}` : 'unknown',
      timestamp,
      stored: true
    });
  } catch (error) {
    console.error('[CALL TRACKING ERROR]', error);
  }
}

// Naive receptionist name picker from transcript
function pickReceptionistName(transcript) {
  const m = transcript.match(/(this is|i am)\s+([A-Z][a-z]+)(?:\s+[A-Z][a-z]+)?\b.*(reception|speaking)/i);
  if (m) return m[2];
  const m2 = transcript.match(/receptionist\s+(?:is|was)\s+([A-Z][a-z]+)(?:\s+[A-Z][a-z]+)?/i);
  return m2 ? m2[1] : '';
}

// Handle successful booking outcomes
async function handleBookingOutcome({ tenantKey, leadPhone, callId, bookingStart, bookingEnd, metadata }) {
  try {
    console.log('[BOOKING OUTCOME]', {
      tenantKey,
      leadPhone,
      callId,
      bookingStart,
      bookingEnd
    });

    // Update lead status to booked
    // This would integrate with the existing lead management system
    // await store.leads.updateOnBooked(leadPhone, { 
    //   status: 'booked', 
    //   booked: true, 
    //   booking_start: bookingStart, 
    //   booking_end: bookingEnd,
    //   callId
    // });

    // Update Google Sheets if configured
    // const tenant = await store.tenants.findByKey(tenantKey);
    // if (tenant?.gsheet_id) {
    //   await sheets.updateLead(tenant.gsheet_id, {
    //     leadPhone,
    //     patch: { 
    //       'Status': 'booked',
    //       'Booked?': 'TRUE',
    //       'Booking Start': bookingStart,
    //       'Booking End': bookingEnd,
    //       'Call ID': callId
    //     }
    //   });
    // }
  } catch (error) {
    console.error('[BOOKING OUTCOME ERROR]', error);
  }
}

// Handle interested prospects - trigger SMS pipeline
async function handleInterestedProspect({ tenantKey, leadPhone, callId, metadata, summary }) {
  try {
    console.log('[INTERESTED PROSPECT]', {
      tenantKey,
      leadPhone,
      callId,
      summary: summary.substring(0, 100) + '...'
    });

    // Extract lead information from metadata
    const leadData = {
      businessName: metadata.businessName || 'Unknown Business',
      decisionMaker: metadata.decisionMaker || 'Unknown Contact',
      phoneNumber: leadPhone,
      industry: metadata.industry || 'unknown',
      location: metadata.location || 'unknown',
      callId: callId,
      summary: summary
    };

    // Trigger SMS pipeline
    await triggerSMSPipeline(leadData);

    console.log('[SMS PIPELINE TRIGGERED]', {
      tenantKey,
      leadPhone,
      callId,
      leadData: {
        businessName: leadData.businessName,
        decisionMaker: leadData.decisionMaker,
        industry: leadData.industry
      }
    });

  } catch (error) {
    console.error('[INTERESTED PROSPECT ERROR]', error);
  }
}

// Trigger SMS pipeline for interested prospects
async function triggerSMSPipeline(leadData) {
  try {
    // Import SMS pipeline
    const SMSEmailPipeline = await import('../sms-email-pipeline.js');
    const smsEmailPipeline = new SMSEmailPipeline.default();

    // Initiate lead capture via SMS
    const result = await smsEmailPipeline.initiateLeadCapture(leadData);
    
    console.log('[SMS PIPELINE RESULT]', {
      success: result.success,
      message: result.message,
      leadId: result.leadId
    });

    return result;
  } catch (error) {
    console.error('[SMS PIPELINE TRIGGER ERROR]', error);
    throw error;
  }
}

// Handle failed call scenarios
async function handleFailedCall({ tenantKey, leadPhone, callId, reason, metadata }) {
  try {
    console.log('[FAILED CALL]', {
      tenantKey,
      leadPhone,
      callId,
      reason,
      note: 'Follow-up rows are created by scheduleFollowUps() after this handler (retry_queue + dashboard Retry Queue).'
    });
  } catch (error) {
    console.error('[FAILED CALL ERROR]', error);
  }
}

export default router;
