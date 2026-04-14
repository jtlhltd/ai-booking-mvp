-- Dashboard + analytics safety: keep common tenant-scoped time filters fast.
-- Postgres: supports WHERE client_key = ? AND created_at >= ? patterns.

CREATE INDEX IF NOT EXISTS calls_client_created_at_idx ON calls(client_key, created_at DESC);

