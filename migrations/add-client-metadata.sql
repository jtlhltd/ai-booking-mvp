-- Client Metadata Table for Automated Onboarding
-- Stores additional client information not in the main tenants table

CREATE TABLE IF NOT EXISTS client_metadata (
  id BIGSERIAL PRIMARY KEY,
  client_key TEXT NOT NULL UNIQUE REFERENCES tenants(client_key) ON DELETE CASCADE,
  
  -- Owner info
  owner_name TEXT,
  owner_email TEXT,
  owner_phone TEXT,
  
  -- Business info
  industry TEXT,
  website TEXT,
  service_area TEXT,
  
  -- Subscription info
  plan_name TEXT, -- 'starter', 'growth', 'pro'
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  trial_ends_at TIMESTAMPTZ,
  subscription_status TEXT DEFAULT 'trial', -- 'trial', 'active', 'cancelled', 'expired'
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS client_metadata_email_idx ON client_metadata(owner_email);
CREATE INDEX IF NOT EXISTS client_metadata_plan_idx ON client_metadata(plan_name);
CREATE INDEX IF NOT EXISTS client_metadata_status_idx ON client_metadata(subscription_status);
CREATE INDEX IF NOT EXISTS client_metadata_trial_idx ON client_metadata(trial_ends_at) WHERE subscription_status = 'trial';

-- Update trigger
CREATE OR REPLACE FUNCTION update_client_metadata_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER client_metadata_update_timestamp
BEFORE UPDATE ON client_metadata
FOR EACH ROW
EXECUTE FUNCTION update_client_metadata_timestamp();

