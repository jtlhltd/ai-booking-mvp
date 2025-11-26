-- Create CRM integrations table to store HubSpot and Salesforce settings
CREATE TABLE IF NOT EXISTS crm_integrations (
  id BIGSERIAL PRIMARY KEY,
  client_key TEXT NOT NULL REFERENCES tenants(client_key) ON DELETE CASCADE,
  crm_type TEXT NOT NULL CHECK (crm_type IN ('hubspot', 'salesforce')),
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled BOOLEAN DEFAULT TRUE,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_key, crm_type)
);

CREATE INDEX IF NOT EXISTS crm_integrations_client_idx ON crm_integrations(client_key);
CREATE INDEX IF NOT EXISTS crm_integrations_type_idx ON crm_integrations(crm_type);
CREATE INDEX IF NOT EXISTS crm_integrations_enabled_idx ON crm_integrations(enabled);

