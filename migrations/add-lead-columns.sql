-- Add missing columns to leads table
-- This enables lead tagging, scoring, and email storage
-- Note: This migration is superseded by add-missing-lead-columns.sql
-- Keeping for backward compatibility but making it safe

-- Only add columns if they don't exist (handles case where add-missing-lead-columns.sql already ran)
DO $$
BEGIN
    -- Check if tags column exists, if not add it as TEXT[] (for array support)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'leads' AND column_name = 'tags'
    ) THEN
        ALTER TABLE leads ADD COLUMN tags TEXT[];
    END IF;
    
    -- Check if score column exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'leads' AND column_name = 'score'
    ) THEN
        ALTER TABLE leads ADD COLUMN score INTEGER DEFAULT 0;
    END IF;
    
    -- Check if email column exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'leads' AND column_name = 'email'
    ) THEN
        ALTER TABLE leads ADD COLUMN email VARCHAR(255);
    END IF;
END $$;

-- Add indexes only if column types support them
-- GIN index only works for TEXT[] or JSONB, not TEXT
DO $$
BEGIN
    -- Only create GIN index if tags is TEXT[] (array type)
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'leads' 
        AND column_name = 'tags' 
        AND data_type = 'ARRAY'
    ) THEN
        CREATE INDEX IF NOT EXISTS idx_leads_tags ON leads USING GIN(tags);
    ELSIF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'leads' 
        AND column_name = 'tags'
    ) THEN
        -- If tags is TEXT (not array), create regular index
        CREATE INDEX IF NOT EXISTS idx_leads_tags ON leads(tags);
    END IF;
END $$;

-- Create other indexes
CREATE INDEX IF NOT EXISTS idx_leads_score ON leads(score);
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
