-- Webhook ingest durability + idempotency
-- Stores provider event ids so downstream side-effects are safe under retries/multi-instance.

CREATE TABLE IF NOT EXISTS webhook_events (
  id BIGSERIAL PRIMARY KEY,
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  call_id TEXT,
  event_type TEXT,
  correlation_id TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processing_started_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  processing_error TEXT,
  payload_json JSONB,
  headers_json JSONB
);

-- Enforce idempotency: the same provider event must only be processed once.
CREATE UNIQUE INDEX IF NOT EXISTS webhook_events_provider_event_id_uidx
  ON webhook_events(provider, event_id);

CREATE INDEX IF NOT EXISTS webhook_events_provider_received_at_idx
  ON webhook_events(provider, received_at DESC);

