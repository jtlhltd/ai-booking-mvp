-- Lead Scoring Automation System
-- This enables intelligent lead prioritization based on multiple factors

-- Add lead scoring columns if they don't exist
ALTER TABLE leads ADD COLUMN IF NOT EXISTS score INTEGER DEFAULT 50;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS score_factors JSONB DEFAULT '{}'::jsonb;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_score_update TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE leads ADD COLUMN IF NOT EXISTS engagement_score INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS conversion_probability DECIMAL(5,2) DEFAULT 0.00;

-- Create lead scoring rules table
CREATE TABLE IF NOT EXISTS lead_scoring_rules (
    id SERIAL PRIMARY KEY,
    rule_name TEXT NOT NULL,
    rule_type TEXT NOT NULL CHECK (rule_type IN ('call_engagement', 'response_pattern', 'demographic', 'behavioral', 'temporal')),
    condition_field TEXT NOT NULL,
    condition_operator TEXT NOT NULL CHECK (condition_operator IN ('equals', 'greater_than', 'less_than', 'contains', 'between')),
    condition_value TEXT NOT NULL,
    score_adjustment INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create lead scoring history table
CREATE TABLE IF NOT EXISTS lead_scoring_history (
    id SERIAL PRIMARY KEY,
    lead_id INTEGER NOT NULL REFERENCES leads(id),
    old_score INTEGER,
    new_score INTEGER,
    score_change INTEGER,
    scoring_factors JSONB,
    triggered_rules JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default scoring rules
INSERT INTO lead_scoring_rules (rule_name, rule_type, condition_field, condition_operator, condition_value, score_adjustment, priority) VALUES
-- Call Engagement Rules
('Long Call Duration', 'call_engagement', 'call_duration', 'greater_than', '300', 15, 1),
('Short Call Duration', 'call_engagement', 'call_duration', 'less_than', '30', -10, 1),
('High Call Quality', 'call_engagement', 'call_quality', 'greater_than', '8', 20, 1),
('Low Call Quality', 'call_engagement', 'call_quality', 'less_than', '4', -15, 1),
('Positive Sentiment', 'call_engagement', 'sentiment', 'equals', 'positive', 10, 1),
('Negative Sentiment', 'call_engagement', 'sentiment', 'equals', 'negative', -20, 1),

-- Response Pattern Rules
('SMS Reply Received', 'response_pattern', 'sms_replies', 'greater_than', '0', 25, 2),
('Callback Requested', 'response_pattern', 'callback_requested', 'equals', 'true', 30, 2),
('Multiple Contact Attempts', 'response_pattern', 'contact_attempts', 'greater_than', '3', -5, 2),
('Quick Response Time', 'response_pattern', 'response_time_hours', 'less_than', '2', 15, 2),

-- Demographic Rules
('Premium Location', 'demographic', 'location_tier', 'equals', 'premium', 10, 3),
('High-Value Industry', 'demographic', 'industry_value', 'equals', 'high', 15, 3),
('Company Size Large', 'demographic', 'company_size', 'equals', 'large', 12, 3),

-- Behavioral Rules
('Website Visit', 'behavioral', 'website_visited', 'equals', 'true', 8, 4),
('Email Open', 'behavioral', 'email_opened', 'equals', 'true', 5, 4),
('Multiple Touchpoints', 'behavioral', 'touchpoint_count', 'greater_than', '5', 20, 4),

-- Temporal Rules
('Recent Lead', 'temporal', 'days_since_created', 'less_than', '7', 10, 5),
('Stale Lead', 'temporal', 'days_since_last_contact', 'greater_than', '30', -15, 5),
('Peak Hours Contact', 'temporal', 'contact_hour', 'between', '9,17', 5, 5);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_leads_score ON leads(score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_engagement_score ON leads(engagement_score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_conversion_probability ON leads(conversion_probability DESC);
CREATE INDEX IF NOT EXISTS idx_leads_last_score_update ON leads(last_score_update);
CREATE INDEX IF NOT EXISTS idx_lead_scoring_history_lead_id ON lead_scoring_history(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_scoring_history_created_at ON lead_scoring_history(created_at DESC);

-- Create function to calculate lead score
CREATE OR REPLACE FUNCTION calculate_lead_score(lead_id INTEGER)
RETURNS INTEGER AS $$
DECLARE
    base_score INTEGER := 50;
    total_adjustment INTEGER := 0;
    rule_record RECORD;
    lead_record RECORD;
    condition_met BOOLEAN;
    triggered_rules JSONB := '[]'::jsonb;
BEGIN
    -- Get lead data
    SELECT * INTO lead_record FROM leads WHERE id = lead_id;
    
    IF NOT FOUND THEN
        RETURN 0;
    END IF;
    
    -- Apply scoring rules
    FOR rule_record IN 
        SELECT * FROM lead_scoring_rules 
        WHERE is_active = true 
        ORDER BY priority ASC, id ASC
    LOOP
        condition_met := false;
        
        -- Evaluate condition based on operator
        CASE rule_record.condition_operator
            WHEN 'equals' THEN
                condition_met := (lead_record.condition_field::TEXT = rule_record.condition_value);
            WHEN 'greater_than' THEN
                condition_met := (lead_record.condition_field::NUMERIC > rule_record.condition_value::NUMERIC);
            WHEN 'less_than' THEN
                condition_met := (lead_record.condition_field::NUMERIC < rule_record.condition_value::NUMERIC);
            WHEN 'contains' THEN
                condition_met := (lead_record.condition_field::TEXT ILIKE '%' || rule_record.condition_value || '%');
            WHEN 'between' THEN
                -- Handle between operator (format: "min,max")
                condition_met := (lead_record.condition_field::NUMERIC BETWEEN 
                    SPLIT_PART(rule_record.condition_value, ',', 1)::NUMERIC AND 
                    SPLIT_PART(rule_record.condition_value, ',', 2)::NUMERIC);
        END CASE;
        
        IF condition_met THEN
            total_adjustment := total_adjustment + rule_record.score_adjustment;
            triggered_rules := triggered_rules || jsonb_build_object(
                'rule_name', rule_record.rule_name,
                'adjustment', rule_record.score_adjustment
            );
        END IF;
    END LOOP;
    
    -- Calculate final score (0-100 range)
    base_score := GREATEST(0, LEAST(100, base_score + total_adjustment));
    
    -- Update lead score
    UPDATE leads 
    SET 
        score = base_score,
        score_factors = triggered_rules,
        last_score_update = NOW(),
        engagement_score = calculate_engagement_score(lead_id),
        conversion_probability = calculate_conversion_probability(lead_id)
    WHERE id = lead_id;
    
    -- Log scoring history
    INSERT INTO lead_scoring_history (lead_id, old_score, new_score, score_change, scoring_factors, triggered_rules)
    VALUES (lead_id, lead_record.score, base_score, base_score - lead_record.score, triggered_rules, triggered_rules);
    
    RETURN base_score;
END;
$$ LANGUAGE plpgsql;

-- Create function to calculate engagement score
CREATE OR REPLACE FUNCTION calculate_engagement_score(lead_id INTEGER)
RETURNS INTEGER AS $$
DECLARE
    engagement_score INTEGER := 0;
    call_count INTEGER;
    avg_duration NUMERIC;
    avg_quality NUMERIC;
    sms_count INTEGER;
    callback_count INTEGER;
BEGIN
    -- Get call statistics
    SELECT COUNT(*), AVG(duration), AVG(quality_score)
    INTO call_count, avg_duration, avg_quality
    FROM calls 
    WHERE lead_id = lead_id;
    
    -- Get SMS and callback counts
    SELECT COUNT(*) INTO sms_count FROM messages WHERE lead_id = lead_id AND direction = 'outbound';
    SELECT COUNT(*) INTO callback_count FROM calls WHERE lead_id = lead_id AND outcome = 'callback_requested';
    
    -- Calculate engagement score (0-100)
    engagement_score := 
        LEAST(100, 
            (call_count * 10) + 
            (COALESCE(avg_duration, 0) / 10) + 
            (COALESCE(avg_quality, 0) * 5) + 
            (sms_count * 5) + 
            (callback_count * 15)
        );
    
    RETURN GREATEST(0, engagement_score);
END;
$$ LANGUAGE plpgsql;

-- Create function to calculate conversion probability
CREATE OR REPLACE FUNCTION calculate_conversion_probability(lead_id INTEGER)
RETURNS DECIMAL(5,2) AS $$
DECLARE
    probability DECIMAL(5,2) := 0.00;
    lead_score INTEGER;
    engagement_score INTEGER;
    days_since_created INTEGER;
    industry_factor DECIMAL(3,2) := 1.0;
BEGIN
    -- Get lead data
    SELECT score, engagement_score, EXTRACT(DAYS FROM NOW() - created_at)::INTEGER
    INTO lead_score, engagement_score, days_since_created
    FROM leads WHERE id = lead_id;
    
    -- Base probability from scores
    probability := (lead_score * 0.4) + (engagement_score * 0.6);
    
    -- Time decay factor (recent leads have higher probability)
    IF days_since_created <= 7 THEN
        probability := probability * 1.2;
    ELSIF days_since_created <= 30 THEN
        probability := probability * 1.0;
    ELSE
        probability := probability * 0.8;
    END IF;
    
    -- Industry factor (would be based on historical conversion rates)
    -- For now, using default factor
    
    RETURN GREATEST(0.00, LEAST(100.00, probability));
END;
$$ LANGUAGE plpgsql;

-- Create function to update all lead scores
CREATE OR REPLACE FUNCTION update_all_lead_scores()
RETURNS INTEGER AS $$
DECLARE
    lead_record RECORD;
    updated_count INTEGER := 0;
BEGIN
    FOR lead_record IN SELECT id FROM leads ORDER BY created_at DESC LIMIT 1000
    LOOP
        PERFORM calculate_lead_score(lead_record.id);
        updated_count := updated_count + 1;
    END LOOP;
    
    RETURN updated_count;
END;
$$ LANGUAGE plpgsql;
