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
DO $$ 
BEGIN
  -- Add subscription_status if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='client_metadata' AND column_name='subscription_status'
  ) THEN
    ALTER TABLE client_metadata ADD COLUMN subscription_status TEXT DEFAULT 'active';
  END IF;
  
  -- Add owner_role if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='client_metadata' AND column_name='owner_role'
  ) THEN
    ALTER TABLE client_metadata ADD COLUMN owner_role TEXT;
  END IF;
  
  -- Add business_size if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='client_metadata' AND column_name='business_size'
  ) THEN
    ALTER TABLE client_metadata ADD COLUMN business_size TEXT;
  END IF;
  
  -- Add monthly_leads if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='client_metadata' AND column_name='monthly_leads'
  ) THEN
    ALTER TABLE client_metadata ADD COLUMN monthly_leads TEXT;
  END IF;
  
  -- Add timezone if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='client_metadata' AND column_name='timezone'
  ) THEN
    ALTER TABLE client_metadata ADD COLUMN timezone TEXT;
  END IF;
  
  -- Add current_lead_source if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='client_metadata' AND column_name='current_lead_source'
  ) THEN
    ALTER TABLE client_metadata ADD COLUMN current_lead_source TEXT;
  END IF;
  
  -- Add working_days if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='client_metadata' AND column_name='working_days'
  ) THEN
    ALTER TABLE client_metadata ADD COLUMN working_days TEXT;
  END IF;
  
  -- Add working_hours if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='client_metadata' AND column_name='working_hours'
  ) THEN
    ALTER TABLE client_metadata ADD COLUMN working_hours TEXT;
  END IF;
  
  -- Add yearly_schedule if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='client_metadata' AND column_name='yearly_schedule'
  ) THEN
    ALTER TABLE client_metadata ADD COLUMN yearly_schedule TEXT;
  END IF;
END $$;

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

