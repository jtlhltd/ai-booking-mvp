-- Perf: support dashboard/monitoring counts like:
-- SELECT COUNT(*) FROM leads WHERE client_key = $1 AND status = 'new' AND created_at >= NOW() - INTERVAL '24 hours'

CREATE INDEX IF NOT EXISTS leads_client_status_created_at_idx
  ON leads (client_key, status, created_at DESC);

