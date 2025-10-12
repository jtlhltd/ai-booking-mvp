-- Add tags support to leads table
-- This allows lead categorization (hot, warm, cold, VIP, referral, etc.)

-- Add tags column if it doesn't exist
DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='leads' AND column_name='tags'
  ) THEN
    ALTER TABLE leads ADD COLUMN tags TEXT;
  END IF;
END $$;

-- Add source column if it doesn't exist (for tracking where leads come from)
DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='leads' AND column_name='source'
  ) THEN
    ALTER TABLE leads ADD COLUMN source TEXT;
  END IF;
END $$;

-- Add custom_fields column for flexible data storage
DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='leads' AND column_name='custom_fields'
  ) THEN
    ALTER TABLE leads ADD COLUMN custom_fields JSONB DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- Add score column for lead scoring (0-100)
DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='leads' AND column_name='score'
  ) THEN
    ALTER TABLE leads ADD COLUMN score INTEGER DEFAULT 50;
  END IF;
END $$;

-- Add last_contacted_at for tracking communication
DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='leads' AND column_name='last_contacted_at'
  ) THEN
    ALTER TABLE leads ADD COLUMN last_contacted_at TIMESTAMPTZ;
  END IF;
END $$;

-- Create index on tags for fast filtering
CREATE INDEX IF NOT EXISTS idx_leads_tags ON leads USING gin(to_tsvector('english', tags));

-- Create index on source for analytics
CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(source);

-- Create index on score for lead prioritization
CREATE INDEX IF NOT EXISTS idx_leads_score ON leads(score DESC);

-- Create index on last_contacted_at for follow-up tracking
CREATE INDEX IF NOT EXISTS idx_leads_last_contacted ON leads(last_contacted_at);

