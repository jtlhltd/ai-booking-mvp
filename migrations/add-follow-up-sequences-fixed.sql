-- Follow-up Sequences System (Simplified)
-- This enables automated follow-up sequences for leads

-- Create follow_up_sequences table
CREATE TABLE IF NOT EXISTS follow_up_sequences (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    client_key TEXT NOT NULL REFERENCES tenants(client_key) ON DELETE CASCADE,
    trigger_event TEXT NOT NULL CHECK (trigger_event IN ('lead_created', 'call_completed', 'appointment_booked', 'appointment_no_show', 'manual')),
    is_active BOOLEAN DEFAULT true,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create follow_up_steps table
CREATE TABLE IF NOT EXISTS follow_up_steps (
    id SERIAL PRIMARY KEY,
    sequence_id INTEGER REFERENCES follow_up_sequences(id) ON DELETE CASCADE,
    step_order INTEGER NOT NULL,
    step_type TEXT NOT NULL CHECK (step_type IN ('email', 'sms', 'call', 'wait')),
    step_name TEXT NOT NULL,
    step_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    delay_hours INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create follow_up_executions table
CREATE TABLE IF NOT EXISTS follow_up_executions (
    id SERIAL PRIMARY KEY,
    sequence_id INTEGER REFERENCES follow_up_sequences(id) ON DELETE CASCADE,
    lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
    client_key TEXT NOT NULL,
    trigger_event TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'paused', 'cancelled')),
    current_step INTEGER DEFAULT 1,
    total_steps INTEGER NOT NULL,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    paused_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create follow_up_step_executions table
CREATE TABLE IF NOT EXISTS follow_up_step_executions (
    id SERIAL PRIMARY KEY,
    execution_id INTEGER REFERENCES follow_up_executions(id) ON DELETE CASCADE,
    step_id INTEGER REFERENCES follow_up_steps(id) ON DELETE CASCADE,
    step_order INTEGER NOT NULL,
    step_type TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'scheduled', 'sent', 'delivered', 'failed', 'skipped')),
    scheduled_for TIMESTAMPTZ,
    executed_at TIMESTAMPTZ,
    result_data JSONB,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create follow_up_analytics table
CREATE TABLE IF NOT EXISTS follow_up_analytics (
    id SERIAL PRIMARY KEY,
    client_key TEXT NOT NULL,
    sequence_id INTEGER REFERENCES follow_up_sequences(id) ON DELETE CASCADE,
    metric_date DATE NOT NULL,
    metric_name TEXT NOT NULL,
    metric_value DECIMAL(15,4),
    metric_unit TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(client_key, sequence_id, metric_date, metric_name)
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_follow_up_sequences_client_key ON follow_up_sequences(client_key);
CREATE INDEX IF NOT EXISTS idx_follow_up_sequences_active ON follow_up_sequences(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_follow_up_steps_sequence_id ON follow_up_steps(sequence_id);
CREATE INDEX IF NOT EXISTS idx_follow_up_executions_client_key ON follow_up_executions(client_key);
CREATE INDEX IF NOT EXISTS idx_follow_up_executions_status ON follow_up_executions(status);
CREATE INDEX IF NOT EXISTS idx_follow_up_step_executions_execution_id ON follow_up_step_executions(execution_id);
CREATE INDEX IF NOT EXISTS idx_follow_up_step_executions_status ON follow_up_step_executions(status);
CREATE INDEX IF NOT EXISTS idx_follow_up_step_executions_scheduled ON follow_up_step_executions(scheduled_for) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_follow_up_analytics_client_date ON follow_up_analytics(client_key, metric_date);

-- Insert some default follow-up sequences
INSERT INTO follow_up_sequences (name, description, client_key, trigger_event, config) VALUES
('New Lead Welcome', 'Welcome sequence for new leads', 'test_beauty_salon', 'lead_created', '{"max_executions_per_lead": 1, "respect_opt_out": true}'),
('Call Follow-up', 'Follow-up after completed calls', 'test_beauty_salon', 'call_completed', '{"max_executions_per_lead": 3, "respect_opt_out": true}'),
('No-show Recovery', 'Recovery sequence for no-shows', 'test_beauty_salon', 'appointment_no_show', '{"max_executions_per_lead": 2, "respect_opt_out": true}')
ON CONFLICT DO NOTHING;

-- Insert default steps for the welcome sequence
INSERT INTO follow_up_steps (sequence_id, step_order, step_type, step_name, step_config, delay_hours) VALUES
(1, 1, 'email', 'Welcome Email', '{"subject": "Welcome to our service!", "template": "welcome"}', 0),
(1, 2, 'wait', 'Wait 24 hours', '{}', 24),
(1, 3, 'sms', 'Follow-up SMS', '{"message": "Thanks for your interest! Reply BOOK to schedule your appointment."}', 0),
(1, 4, 'wait', 'Wait 3 days', '{}', 72),
(1, 5, 'email', 'Final Follow-up', '{"subject": "Don''t miss out!", "template": "final_followup"}', 0)
ON CONFLICT DO NOTHING;
