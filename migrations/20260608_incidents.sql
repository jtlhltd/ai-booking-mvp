-- Grouped operational incidents (alert deduplication + lifecycle)
CREATE TABLE IF NOT EXISTS incidents (
  id SERIAL PRIMARY KEY,
  fingerprint TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning',
  status TEXT NOT NULL DEFAULT 'open',
  source TEXT,
  event_count INTEGER NOT NULL DEFAULT 1,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_notified_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS incidents_status_idx ON incidents(status);
CREATE INDEX IF NOT EXISTS incidents_last_seen_idx ON incidents(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS incidents_fingerprint_idx ON incidents(fingerprint);
