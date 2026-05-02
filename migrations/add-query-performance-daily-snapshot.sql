-- Nightly snapshot of top slow-query aggregates for trend analysis (PR-14).
CREATE TABLE IF NOT EXISTS query_performance_daily (
  id BIGSERIAL PRIMARY KEY,
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  query_hash TEXT NOT NULL,
  query_preview TEXT,
  avg_duration DOUBLE PRECISION,
  max_duration DOUBLE PRECISION,
  call_count BIGINT,
  inferred_surface TEXT
);

CREATE INDEX IF NOT EXISTS query_performance_daily_snapshot_at_idx
  ON query_performance_daily (snapshot_at DESC);
