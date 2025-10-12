-- QUICK FIX - Complete the System Setup
-- Run this in Render PostgreSQL console to enable all new features
-- Time required: 5 minutes

-- ============================================================================
-- ADD MISSING COLUMNS TO LEADS TABLE
-- ============================================================================

-- Add email column (for storing lead emails)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS email TEXT;

-- Add tags column (for lead categorization: hot, warm, cold, VIP, referral)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS tags TEXT;

-- Add score column (for AI lead scoring 0-100)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS score INTEGER DEFAULT 50;

-- Add custom_fields column (for flexible data storage)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}'::jsonb;

-- Add last_contacted_at (for tracking communication)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMPTZ;

-- Add updated_at (for tracking changes)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ============================================================================
-- CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

-- Index on email for fast lookups
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);

-- Index on tags for filtering (full-text search)
CREATE INDEX IF NOT EXISTS idx_leads_tags ON leads USING gin(to_tsvector('english', COALESCE(tags, '')));

-- Index on score for lead prioritization
CREATE INDEX IF NOT EXISTS idx_leads_score ON leads(score DESC);

-- Index on source for analytics
CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(source);

-- Index on last_contacted_at for follow-up tracking
CREATE INDEX IF NOT EXISTS idx_leads_last_contacted ON leads(last_contacted_at);

-- Index on updated_at for recent changes
CREATE INDEX IF NOT EXISTS idx_leads_updated ON leads(updated_at DESC);

-- ============================================================================
-- VERIFY COLUMNS WERE ADDED
-- ============================================================================

-- Check leads table structure
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'leads' 
ORDER BY ordinal_position;

-- ============================================================================
-- SUCCESS! 
-- ============================================================================
-- After running this, all new features will work:
-- ✅ Lead tagging
-- ✅ Lead scoring
-- ✅ Email storage
-- ✅ Custom fields
-- ✅ Contact tracking
-- ✅ Lead management page (fully functional)
-- ============================================================================

