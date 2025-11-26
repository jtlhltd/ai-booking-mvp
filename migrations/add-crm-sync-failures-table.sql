-- Create table to track CRM sync failures for monitoring and alerting
CREATE TABLE IF NOT EXISTS crm_sync_failures (
  id BIGSERIAL PRIMARY KEY,
  client_key TEXT NOT NULL REFERENCES tenants(client_key) ON DELETE CASCADE,
  crm_type TEXT NOT NULL CHECK (crm_type IN ('hubspot', 'salesforce')),
  operation TEXT NOT NULL,
  error_message TEXT NOT NULL,
  error_details JSONB,
  retry_count INTEGER DEFAULT 0,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crm_sync_failures_client_idx ON crm_sync_failures(client_key);
CREATE INDEX IF NOT EXISTS crm_sync_failures_type_idx ON crm_sync_failures(crm_type);
CREATE INDEX IF NOT EXISTS crm_sync_failures_resolved_idx ON crm_sync_failures(resolved);
CREATE INDEX IF NOT EXISTS crm_sync_failures_created_idx ON crm_sync_failures(created_at);

