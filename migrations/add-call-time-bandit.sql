-- Thompson sampling state for optimal outbound dial hour (per tenant)
CREATE TABLE IF NOT EXISTS call_time_bandit (
  client_key TEXT PRIMARY KEY REFERENCES tenants(client_key) ON DELETE CASCADE,
  arms JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS call_time_bandit_observations (
  call_id TEXT PRIMARY KEY,
  client_key TEXT NOT NULL REFERENCES tenants(client_key) ON DELETE CASCADE,
  hour SMALLINT NOT NULL,
  success BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bandit_obs_tenant_idx ON call_time_bandit_observations(client_key);
