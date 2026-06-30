/**
 * Outbound consumer webhooks (e.g. Tom app) — call.completed events with HMAC signing.
 */
import crypto from 'crypto';
import { nanoid } from 'nanoid';
import { addWebhookToRetryQueue } from './webhook-retry.js';

const API_VERSION = '2026-06-30';

export function parseConsumerWebhookConfig(client) {
  const raw = client?.consumerWebhook || client?.consumer_webhook_json;
  if (!raw || typeof raw !== 'object') return null;
  const url = String(raw.url || '').trim();
  const secret = String(raw.secret || '').trim();
  const enabled = raw.enabled !== false;
  const events = Array.isArray(raw.events) ? raw.events.map(String) : ['call.completed'];
  if (!url || !secret || !enabled) return null;
  return { url, secret, enabled, events };
}

export function signConsumerWebhookBody(secret, timestamp, bodyString) {
  const digest = crypto.createHmac('sha256', secret).update(`${timestamp}.${bodyString}`).digest('hex');
  return `sha256=${digest}`;
}

export function buildCallCompletedEnvelope({ tenantDisplayName, call, qualification, links = {} }) {
  return {
    id: `evt_${nanoid(16)}`,
    type: 'call.completed',
    apiVersion: API_VERSION,
    createdAt: new Date().toISOString(),
    tenant: {
      displayName: tenantDisplayName || 'Client',
    },
    data: {
      call,
      qualification: qualification || null,
      links,
    },
  };
}

function parseMetadata(meta) {
  if (!meta) return {};
  if (typeof meta === 'object' && !Array.isArray(meta)) return meta;
  try {
    return JSON.parse(String(meta));
  } catch {
    return {};
  }
}

export async function loadCallRowForWebhook(clientKey, callId) {
  if (!callId) return null;
  const { query } = await import('../db.js');
  const result = await query(
    `
    SELECT call_id, id, lead_phone, status, outcome, duration, cost, transcript, summary,
           created_at, metadata
    FROM calls
    WHERE client_key = $1
      AND (call_id = $2 OR id::text = $2)
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [clientKey, String(callId)]
  );
  return result.rows?.[0] || null;
}

export function buildCallCompletedPayloadFromRows({ client, callRow, handoffRow, callId, leadPhone }) {
  const meta = parseMetadata(callRow?.metadata);
  const dataJson = handoffRow?.dataJson ?? handoffRow?.data_json;
  let handoffData = null;
  if (dataJson) {
    if (typeof dataJson === 'object') handoffData = dataJson;
    else {
      try {
        handoffData = JSON.parse(String(dataJson));
      } catch {
        handoffData = null;
      }
    }
  }
  const qual = handoffData?.qual || handoffData || {};
  const sequence = handoffData?.sequence || qual?.sequence || null;

  const call = {
    id: callRow?.call_id || callId || null,
    leadPhone: callRow?.lead_phone || leadPhone || '',
    leadName: meta.leadName || meta.businessName || '',
    status: callRow?.status || 'ended',
    outcome: callRow?.outcome || meta.outcome || '',
    endedReason: meta.endedReason || meta.ended_reason || null,
    durationSeconds: callRow?.duration != null ? Number(callRow.duration) : null,
    recordingUrl: meta.recordingUrl || meta.recording_url || null,
    transcriptAvailable: !!(callRow?.transcript && String(callRow.transcript).length > 0),
    costUsd: callRow?.cost != null ? Number(callRow.cost) : null,
    createdAt: callRow?.created_at || null,
    completedAt: new Date().toISOString(),
    dialMode: meta.outboundDialMode || meta.dialMode || null,
    sequence: sequence
      ? {
          stageId: meta.stageId || null,
          stageComplete: meta.stageComplete === true,
          sequenceStatus: sequence.status || null,
          attemptsTotal: meta.attemptsTotal ?? null,
        }
      : null,
    externalRef: meta.externalRef || meta.leadId || null,
  };

  const qualification = handoffRow
    ? {
        summary: handoffRow.summaryText || handoffRow.summary_text || callRow?.summary || '',
        decisionMaker: handoffRow.decisionMaker || handoffRow.decision_maker || '',
        callbackWindow: handoffRow.callbackWindow || handoffRow.callback_window || '',
        callbackNeeded: !!(handoffRow.callbackWindow || handoffRow.callback_window),
        fields: { ...qual },
        schema: 'logistics_v1',
      }
    : null;

  return buildCallCompletedEnvelope({
    tenantDisplayName: client?.displayName || client?.name || 'Client',
    call,
    qualification,
  });
}

export async function deliverConsumerWebhook({ url, secret, envelope, clientKey, leadPhone }) {
  const bodyString = JSON.stringify(envelope);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = signConsumerWebhookBody(secret, timestamp, bodyString);
  const headers = {
    'Content-Type': 'application/json',
    'X-CallBot-Timestamp': timestamp,
    'X-CallBot-Signature': signature,
    'X-CallBot-Event': envelope.type,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: bodyString,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`consumer_webhook_${response.status}: ${errText.slice(0, 200)}`);
  }
  return { ok: true, status: response.status };
}

/**
 * Fire-and-forget call.completed to tenant consumer webhook URL.
 */
export function scheduleConsumerCallCompletedWebhook({ clientKey, callId, leadPhone }) {
  if (process.env.JEST_WORKER_ID != null) return;
  setImmediate(() => {
    void emitConsumerCallCompletedWebhook({ clientKey, callId, leadPhone }).catch((err) => {
      console.warn('[CONSUMER WEBHOOK] emit failed (non-fatal):', err?.message || err);
    });
  });
}

export async function emitConsumerCallCompletedWebhook({ clientKey, callId, leadPhone }) {
  const { getFullClient, getLeadHandoffByPhone } = await import('../db.js');
  const client = await getFullClient(clientKey);
  const cfg = parseConsumerWebhookConfig(client);
  if (!cfg || !cfg.events.includes('call.completed')) return { skipped: true, reason: 'not_configured' };

  const callRow = await loadCallRowForWebhook(clientKey, callId);
  const phone = leadPhone || callRow?.lead_phone || '';
  const handoffRow = phone ? await getLeadHandoffByPhone({ clientKey, leadPhone: phone }).catch(() => null) : null;
  const envelope = buildCallCompletedPayloadFromRows({
    client,
    callRow,
    handoffRow,
    callId,
    leadPhone: phone,
  });

  try {
    await deliverConsumerWebhook({
      url: cfg.url,
      secret: cfg.secret,
      envelope,
      clientKey,
      leadPhone: phone,
    });
    return { ok: true };
  } catch (error) {
    await addWebhookToRetryQueue({
      webhookType: 'consumer_call_completed',
      webhookUrl: cfg.url,
      payload: envelope,
      headers: {
        'Content-Type': 'application/json',
        'X-CallBot-Event': envelope.type,
      },
      error,
    });
    return { ok: false, queued: true };
  }
}
