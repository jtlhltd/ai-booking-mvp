import express from 'express';
import { verifyVapiSignature } from '../middleware/vapi-webhook-verification.js';
import { vapiWebhookVerboseLog } from '../lib/vapi-webhook-verbose-log.js';
import {
  pickVapiCallId,
  pickVapiEventType,
  deriveVapiEventId
} from '../lib/vapi-webhooks/webhook-ids.js';
import {
  tryInsertWebhookEvent,
  tryClaimExistingWebhookEvent,
  markWebhookEventProcessingStarted,
  markWebhookEventProcessed,
  markWebhookEventFailed
} from '../lib/vapi-webhooks/webhook-events-db.js';
import { createVapiRawBodyMiddleware } from '../lib/vapi-webhooks/raw-body-middleware.js';
import { callStore, CALL_STORE_MAX } from '../lib/vapi-webhooks/conversation-store.js';
import { processWebhookPayload } from '../lib/vapi-webhooks/process-webhook-payload.js';
import { captureException, runIsolatedSpan } from '../lib/sentry.js';

const router = express.Router();

router.use('/webhooks/vapi', createVapiRawBodyMiddleware());

router.post('/webhooks/vapi', verifyVapiSignature, async (req, res) => {
  const body = req.body || {};
  const correlationId = body.metadata?.correlationId ||
                        body.metadata?.requestId ||
                        body.call?.metadata?.correlationId ||
                        `webhook_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  req.correlationId = correlationId;
  req.id = correlationId;

  console.log(`[${correlationId}] [VAPI WEBHOOK] received type=${body?.message?.type || body?.type || 'unknown'}`);

  try {
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
      const claim = await tryClaimExistingWebhookEvent({ provider: 'vapi', eventId });
      if (!claim.claimed) {
        res.status(200).json({ ok: true, received: true, deduped: true });
        return;
      }
    }

    vapiWebhookVerboseLog('RAW TYPE:', body?.message?.type || body?.type);
    if (body?.message?.type === 'end-of-call-report') {
      const rawCall = body?.message?.call;
      vapiWebhookVerboseLog('RAW CALL KEYS:', rawCall ? Object.keys(rawCall) : 'NO CALL');
      vapiWebhookVerboseLog('RAW HAS ARTIFACT FIELD:', rawCall ? 'artifact' in rawCall : 'NO CALL');
      vapiWebhookVerboseLog('RAW ARTIFACT VALUE:', rawCall?.artifact);
      const mc = rawCall?.messages;
      const msgCount = Array.isArray(mc) ? mc.length : null;
      const msgKeys = mc && typeof mc === 'object' && !Array.isArray(mc) ? Object.keys(mc) : null;
      vapiWebhookVerboseLog('RAW message.call.messages: type=%s, length=%s, keys=%s', typeof mc, msgCount ?? 'N/A', msgKeys ? JSON.stringify(msgKeys) : 'N/A');
    }
    if (req.body?.type === 'end-of-call-report') {
      vapiWebhookVerboseLog('END OF CALL PAYLOAD:', JSON.stringify(req.body, null, 2));
    }
    vapiWebhookVerboseLog(`[${correlationId}] [VAPI WEBHOOK DEBUG] Raw body:`, JSON.stringify(req.body, null, 2));
    vapiWebhookVerboseLog(`[${correlationId}] [VAPI WEBHOOK DEBUG] Raw body type:`, typeof req.body);
    vapiWebhookVerboseLog(`[${correlationId}] [VAPI WEBHOOK DEBUG] Body keys:`, Object.keys(req.body || {}));
    vapiWebhookVerboseLog(`[${correlationId}] [VAPI WEBHOOK DEBUG] Headers:`, JSON.stringify(req.headers, null, 2));
    const message = body.message || null;
    if (message && typeof message === 'object') {
      body.call = body.call || message.call || {};
      if (!body.status && message.type) body.status = message.type;

      if (message.call) {
        if (!body.recordingUrl && message.call.recordingUrl) {
          body.recordingUrl = message.call.recordingUrl;
        }
        if (message.call.artifact && !body.call.artifact) {
          body.call.artifact = message.call.artifact;
        }
      }

      if (!body.transcript && message.transcript) {
        body.transcript = message.transcript;
      }

      if (!body.transcript && (message.data?.transcript || message.report?.transcript)) {
        body.transcript = message.data?.transcript || message.report?.transcript;
      }

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
      if (message.endedReason != null) body.endedReason = message.endedReason;
      if (message.call?.endedReason != null) body.endedReason = body.endedReason ?? message.call.endedReason;
    }
    if (body.call?.endedReason != null) body.endedReason = body.endedReason ?? body.call.endedReason;
    if (body.endedReason == null && body.endOfCallReport?.endedReason != null) body.endedReason = body.endOfCallReport.endedReason;

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
      await markWebhookEventProcessed({ provider: 'vapi', eventId });
      res.status(200).json({ ok: true, received: true });
      return;
    }

    res.status(200).json({ ok: true, received: true });

    runIsolatedSpan(
      {
        name: 'vapi.webhook.process_async',
        op: 'vapi.webhook',
        attributes: {
          correlationId,
          callId: callIdForEvent,
          eventId,
          eventType,
        },
      },
      async () => {
        try {
          await markWebhookEventProcessingStarted({ provider: 'vapi', eventId });
          await processWebhookPayload(body, correlationId);
          await markWebhookEventProcessed({ provider: 'vapi', eventId });
        } catch (err) {
          console.error(`[${correlationId}] [VAPI WEBHOOK] Post-200 processing error:`, err);
          console.error(`[${correlationId}] [VAPI WEBHOOK] Stack:`, err.stack);
          captureException(err, {
            correlationId,
            callId: callIdForEvent,
            eventId,
            eventType,
            service: 'vapi-webhook',
          });
          try {
            await markWebhookEventFailed({ provider: 'vapi', eventId, error: err });
          } catch (_) {
            // best effort
          }
        }
      }
    );
  } catch (err) {
    console.error(`[${correlationId}] [VAPI WEBHOOK] Handler error (before 200):`, err);
    if (!res.headersSent) res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
