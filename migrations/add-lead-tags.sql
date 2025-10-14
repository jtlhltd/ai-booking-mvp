-- Add tags support to leads table
-- This allows lead categorization (hot, warm, cold, VIP, referral, etc.)

-- Add tags column if it doesn't exist
ALTER TABLE leads ADD COLUMN IF NOT EXISTS tags TEXT;

-- Add source column if it doesn't exist (for tracking where leads come from)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS source TEXT;

-- Add custom_fields column for flexible data storage
ALTER TABLE leads ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}'::jsonb;

-- Add score column for lead scoring (0-100)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS score INTEGER DEFAULT 50;

-- Add last_contacted_at for tracking communication
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMPTZ;

-- Create index on tags for fast filtering
CREATE INDEX IF NOT EXISTS idx_leads_tags ON leads USING gin(to_tsvector('english', tags));

-- Create index on source for analytics
CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(source);

-- Create index on score for lead prioritization
CREATE INDEX IF NOT EXISTS idx_leads_score ON leads(score DESC);

-- Create index on last_contacted_at for follow-up tracking
CREATE INDEX IF NOT EXISTS idx_leads_last_contacted ON leads(last_contacted_at);

