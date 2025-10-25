-- Add remaining missing columns to leads table
-- This completes the lead management functionality

ALTER TABLE leads ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}'::jsonb;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_leads_custom_fields ON leads USING GIN(custom_fields);
CREATE INDEX IF NOT EXISTS idx_leads_last_contacted ON leads(last_contacted_at);
CREATE INDEX IF NOT EXISTS idx_leads_updated_at ON leads(updated_at);

-- Add trigger to automatically update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_leads_updated_at 
    BEFORE UPDATE ON leads 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();
