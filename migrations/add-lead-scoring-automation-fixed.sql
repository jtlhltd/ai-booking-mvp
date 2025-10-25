-- Lead Scoring Automation System (Simplified)
-- This enables automated lead scoring and prioritization

-- Create lead_scoring_rules table
CREATE TABLE IF NOT EXISTS lead_scoring_rules (
    id SERIAL PRIMARY KEY,
    client_key TEXT NOT NULL REFERENCES tenants(client_key) ON DELETE CASCADE,
    rule_name TEXT NOT NULL,
    rule_description TEXT,
    rule_type TEXT NOT NULL CHECK (rule_type IN ('positive', 'negative', 'multiplier')),
    condition_field TEXT NOT NULL,
    condition_operator TEXT NOT NULL CHECK (condition_operator IN ('equals', 'contains', 'greater_than', 'less_than', 'exists', 'not_exists')),
    condition_value TEXT,
    score_points INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create lead_scoring_history table
CREATE TABLE IF NOT EXISTS lead_scoring_history (
    id SERIAL PRIMARY KEY,
    lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
    client_key TEXT NOT NULL,
    old_score INTEGER,
    new_score INTEGER,
    score_change INTEGER,
    triggered_rules JSONB,
    scoring_reason TEXT,
    scored_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create lead_scoring_analytics table
CREATE TABLE IF NOT EXISTS lead_scoring_analytics (
    id SERIAL PRIMARY KEY,
    client_key TEXT NOT NULL,
    metric_date DATE NOT NULL,
    metric_name TEXT NOT NULL,
    metric_value DECIMAL(15,4),
    metric_unit TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(client_key, metric_date, metric_name)
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_lead_scoring_rules_client_key ON lead_scoring_rules(client_key);
CREATE INDEX IF NOT EXISTS idx_lead_scoring_rules_active ON lead_scoring_rules(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_lead_scoring_history_lead_id ON lead_scoring_history(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_scoring_history_client_key ON lead_scoring_history(client_key);
CREATE INDEX IF NOT EXISTS idx_lead_scoring_history_scored_at ON lead_scoring_history(scored_at);
CREATE INDEX IF NOT EXISTS idx_lead_scoring_analytics_client_date ON lead_scoring_analytics(client_key, metric_date);

-- Insert some default scoring rules
INSERT INTO lead_scoring_rules (client_key, rule_name, rule_description, rule_type, condition_field, condition_operator, condition_value, score_points, priority) VALUES
('test_beauty_salon', 'High Value Service', 'Leads interested in premium services get higher scores', 'positive', 'service', 'contains', 'premium', 20, 1),
('test_beauty_salon', 'Quick Response', 'Leads who respond quickly get bonus points', 'positive', 'response_time_minutes', 'less_than', '30', 15, 2),
('test_beauty_salon', 'Multiple Contacts', 'Leads with multiple contact attempts get higher priority', 'positive', 'contact_count', 'greater_than', '2', 10, 3),
('test_beauty_salon', 'Opt-out Penalty', 'Leads who opt out get negative score', 'negative', 'opt_out', 'equals', 'true', -50, 1),
('test_beauty_salon', 'Email Engagement', 'Leads who open emails get bonus points', 'positive', 'email_opens', 'greater_than', '0', 5, 4),
('test_beauty_salon', 'Phone Engagement', 'Leads who answer calls get bonus points', 'positive', 'call_answered', 'equals', 'true', 10, 3)
ON CONFLICT DO NOTHING;

-- Update existing leads with initial scores
UPDATE leads SET score = 50 WHERE score IS NULL;
