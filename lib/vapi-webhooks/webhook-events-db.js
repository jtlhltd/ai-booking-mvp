import { query, dbType } from '../../db.js';

function isPostgres() {
  return dbType === 'postgres';
}

export async function tryInsertWebhookEvent({ provider, eventId, callId, eventType, correlationId, payload, headers }) {
  if (!isPostgres()) {
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
    const msg = String(e?.message || '');
    if (msg.toLowerCase().includes('webhook_events') || msg.toLowerCase().includes('relation')) {
      console.warn('[VAPI WEBHOOK] webhook_events table not available yet; proceeding without DB idempotency');
      return { inserted: true, degraded: true };
    }
    throw e;
  }
}

export async function tryClaimExistingWebhookEvent({ provider, eventId }) {
  if (!isPostgres()) return { claimed: false };
  const leaseMinutes = Math.max(1, Math.min(60, parseInt(String(process.env.WEBHOOK_EVENT_LEASE_MINUTES || '10'), 10) || 10));
  const r = await query(
    `
    UPDATE webhook_events
    SET processing_started_at = NOW(),
        processing_error = NULL
    WHERE provider = $1
      AND event_id = $2
      AND processed_at IS NULL
      AND (
        processing_started_at IS NULL OR
        processing_started_at < NOW() - ($3::int * INTERVAL '1 minute')
      )
    RETURNING id
  `,
    [provider, eventId, leaseMinutes]
  );
  return { claimed: Array.isArray(r?.rows) && r.rows.length > 0, leaseMinutes };
}

export async function markWebhookEventProcessingStarted({ provider, eventId }) {
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

export async function markWebhookEventProcessed({ provider, eventId }) {
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

export async function markWebhookEventFailed({ provider, eventId, error }) {
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
