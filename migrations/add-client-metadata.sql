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
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add columns if they don't exist (for existing tables)
-- Note: Each statement needs semicolon for migration runner

-- Add subscription_status if missing
ALTER TABLE client_metadata ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'active';

-- Add owner_role if missing  
ALTER TABLE client_metadata ADD COLUMN IF NOT EXISTS owner_role TEXT;

-- Add business_size if missing
ALTER TABLE client_metadata ADD COLUMN IF NOT EXISTS business_size TEXT;

-- Add monthly_leads if missing
ALTER TABLE client_metadata ADD COLUMN IF NOT EXISTS monthly_leads TEXT;

-- Add timezone if missing
ALTER TABLE client_metadata ADD COLUMN IF NOT EXISTS timezone TEXT;

-- Add current_lead_source if missing
ALTER TABLE client_metadata ADD COLUMN IF NOT EXISTS current_lead_source TEXT;

-- Add working_days if missing
ALTER TABLE client_metadata ADD COLUMN IF NOT EXISTS working_days TEXT;

-- Add working_hours if missing
ALTER TABLE client_metadata ADD COLUMN IF NOT EXISTS working_hours TEXT;

-- Add yearly_schedule if missing
ALTER TABLE client_metadata ADD COLUMN IF NOT EXISTS yearly_schedule TEXT;

-- Indexes (only create if columns exist)
CREATE INDEX IF NOT EXISTS client_metadata_email_idx ON client_metadata(owner_email);
CREATE INDEX IF NOT EXISTS client_metadata_plan_idx ON client_metadata(plan_name);

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

