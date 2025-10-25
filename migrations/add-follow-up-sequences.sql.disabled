-- Automated Follow-up Sequences System
-- This enables intelligent, multi-channel follow-up automation

-- Create follow-up sequences table
CREATE TABLE IF NOT EXISTS follow_up_sequences (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    trigger_type TEXT NOT NULL CHECK (trigger_type IN ('call_outcome', 'appointment_status', 'lead_behavior', 'time_based', 'score_based')),
    trigger_conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 0,
    client_key TEXT REFERENCES tenants(client_key) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create follow-up steps table
CREATE TABLE IF NOT EXISTS follow_up_steps (
    id SERIAL PRIMARY KEY,
    sequence_id INTEGER NOT NULL REFERENCES follow_up_sequences(id) ON DELETE CASCADE,
    step_order INTEGER NOT NULL,
    step_type TEXT NOT NULL CHECK (step_type IN ('email', 'sms', 'call', 'wait')),
    delay_hours INTEGER DEFAULT 0,
    delay_days INTEGER DEFAULT 0,
    subject TEXT,
    content TEXT NOT NULL,
    template_variables JSONB DEFAULT '{}'::jsonb,
    conditions JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create follow-up executions table
CREATE TABLE IF NOT EXISTS follow_up_executions (
    id SERIAL PRIMARY KEY,
    sequence_id INTEGER NOT NULL REFERENCES follow_up_sequences(id),
    lead_id INTEGER NOT NULL REFERENCES leads(id),
    client_key TEXT NOT NULL,
    trigger_data JSONB DEFAULT '{}'::jsonb,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'paused', 'cancelled')),
    current_step INTEGER DEFAULT 1,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    last_executed_at TIMESTAMPTZ,
    execution_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create follow-up step executions table
CREATE TABLE IF NOT EXISTS follow_up_step_executions (
    id SERIAL PRIMARY KEY,
    execution_id INTEGER NOT NULL REFERENCES follow_up_executions(id) ON DELETE CASCADE,
    step_id INTEGER NOT NULL REFERENCES follow_up_steps(id),
    step_order INTEGER NOT NULL,
    scheduled_for TIMESTAMPTZ NOT NULL,
    executed_at TIMESTAMPTZ,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'skipped')),
    delivery_method TEXT,
    external_id TEXT, -- SMS SID, email message ID, etc.
    response_data JSONB DEFAULT '{}'::jsonb,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create follow-up templates table
CREATE TABLE IF NOT EXISTS follow_up_templates (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    template_type TEXT NOT NULL CHECK (template_type IN ('email', 'sms', 'call_script')),
    subject TEXT,
    content TEXT NOT NULL,
    variables JSONB DEFAULT '{}'::jsonb,
    client_key TEXT REFERENCES tenants(client_key) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT true,
    usage_count INTEGER DEFAULT 0,
    success_rate DECIMAL(5,2) DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create follow-up analytics table
CREATE TABLE IF NOT EXISTS follow_up_analytics (
    id SERIAL PRIMARY KEY,
    sequence_id INTEGER REFERENCES follow_up_sequences(id),
    lead_id INTEGER REFERENCES leads(id),
    execution_id INTEGER REFERENCES follow_up_executions(id),
    step_id INTEGER REFERENCES follow_up_steps(id),
    metric_type TEXT NOT NULL CHECK (metric_type IN ('open', 'click', 'reply', 'conversion', 'unsubscribe')),
    metric_value DECIMAL(10,2) DEFAULT 0.00,
    metadata JSONB DEFAULT '{}'::jsonb,
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_follow_up_sequences_client_key ON follow_up_sequences(client_key);
CREATE INDEX IF NOT EXISTS idx_follow_up_sequences_trigger_type ON follow_up_sequences(trigger_type);
CREATE INDEX IF NOT EXISTS idx_follow_up_steps_sequence_id ON follow_up_steps(sequence_id);
CREATE INDEX IF NOT EXISTS idx_follow_up_executions_lead_id ON follow_up_executions(lead_id);
CREATE INDEX IF NOT EXISTS idx_follow_up_executions_status ON follow_up_executions(status);
CREATE INDEX IF NOT EXISTS idx_follow_up_executions_scheduled_for ON follow_up_executions(last_executed_at);
CREATE INDEX IF NOT EXISTS idx_follow_up_step_executions_scheduled_for ON follow_up_step_executions(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_follow_up_step_executions_status ON follow_up_step_executions(status);
CREATE INDEX IF NOT EXISTS idx_follow_up_templates_client_key ON follow_up_templates(client_key);
CREATE INDEX IF NOT EXISTS idx_follow_up_analytics_sequence_id ON follow_up_analytics(sequence_id);

-- Insert default follow-up sequences
INSERT INTO follow_up_sequences (name, description, trigger_type, trigger_conditions, priority) VALUES
-- Call-based sequences
('No Answer Follow-up', 'Follow up with leads who didn''t answer calls', 'call_outcome', '{"outcome": "no_answer", "attempts": 1}', 1),
('Callback Requested', 'Follow up sequence for leads who requested callbacks', 'call_outcome', '{"outcome": "callback_requested"}', 2),
('Interested Lead', 'Nurture sequence for interested leads', 'call_outcome', '{"outcome": "interested", "score": ">50"}', 3),

-- Appointment-based sequences
('Appointment Confirmation', 'Confirm appointments 24 hours before', 'appointment_status', '{"status": "scheduled", "hours_before": 24}', 1),
('No Show Follow-up', 'Follow up with no-show appointments', 'appointment_status', '{"status": "no_show"}', 2),
('Appointment Completed', 'Follow up after completed appointments', 'appointment_status', '{"status": "completed", "hours_after": 2}', 3),

-- Lead behavior sequences
('High Score Lead', 'Priority sequence for high-scoring leads', 'score_based', '{"score": ">80"}', 1),
('Stale Lead Re-engagement', 'Re-engage leads who haven''t been contacted recently', 'time_based', '{"days_since_last_contact": ">7"}', 2),

-- Time-based sequences
('New Lead Welcome', 'Welcome sequence for new leads', 'time_based', '{"hours_since_created": "<2"}', 1);

-- Insert default follow-up steps for "No Answer Follow-up" sequence
INSERT INTO follow_up_steps (sequence_id, step_order, step_type, delay_hours, subject, content, template_variables) VALUES
(1, 1, 'sms', 2, NULL, 'Hi {{lead_name}}, I tried calling you earlier about {{service_type}}. When would be a good time to connect?', '{"lead_name": "name", "service_type": "primary_service"}'),
(1, 2, 'email', 24, 'Quick follow-up on our call', 'Hi {{lead_name}},\n\nI tried reaching you earlier about {{service_type}}. I''d love to discuss how we can help {{business_name}}.\n\nBest regards,\n{{agent_name}}', '{"lead_name": "name", "service_type": "primary_service", "business_name": "business_name", "agent_name": "agent_name"}'),
(1, 3, 'call', 48, NULL, 'Call script: Follow up on previous attempts, offer flexible scheduling', '{}'),
(1, 4, 'wait', 0, NULL, 'Wait 7 days before next sequence', '{}');

-- Insert default follow-up steps for "Callback Requested" sequence
INSERT INTO follow_up_steps (sequence_id, step_order, step_type, delay_hours, subject, content, template_variables) VALUES
(2, 1, 'sms', 1, NULL, 'Hi {{lead_name}}, I''ll call you back at {{preferred_time}} as requested. Looking forward to speaking with you!', '{"lead_name": "name", "preferred_time": "preferred_call_time"}'),
(2, 2, 'call', 0, NULL, 'Call script: Return call as requested, be prepared with relevant information', '{}'),
(2, 3, 'email', 2, 'Thank you for your interest', 'Hi {{lead_name}},\n\nThank you for your interest in {{service_type}}. I''ve scheduled a call with you and will follow up with additional information.\n\nBest regards,\n{{agent_name}}', '{"lead_name": "name", "service_type": "primary_service", "agent_name": "agent_name"}');

-- Insert default follow-up steps for "No Show Follow-up" sequence
INSERT INTO follow_up_steps (sequence_id, step_order, step_type, delay_hours, subject, content, template_variables) VALUES
(6, 1, 'sms', 1, NULL, 'Hi {{lead_name}}, I noticed you missed our appointment today. No worries! Would you like to reschedule?', '{"lead_name": "name"}'),
(6, 2, 'email', 4, 'Missed appointment - Let''s reschedule', 'Hi {{lead_name}},\n\nI hope everything is okay. I noticed you missed our appointment today for {{service_type}}.\n\nI''d be happy to reschedule at a more convenient time. Please let me know what works best for you.\n\nBest regards,\n{{agent_name}}', '{"lead_name": "name", "service_type": "primary_service", "agent_name": "agent_name"}'),
(6, 3, 'call', 24, NULL, 'Call script: Check if everything is okay, offer to reschedule, be understanding', '{}');

-- Insert default templates
INSERT INTO follow_up_templates (name, template_type, subject, content, variables) VALUES
('Welcome Email', 'email', 'Welcome to {{business_name}}', 'Hi {{lead_name}},\n\nWelcome! Thank you for your interest in {{service_type}}.\n\nWe''re excited to help {{business_name}} grow and succeed.\n\nBest regards,\n{{agent_name}}', '{"lead_name": "name", "business_name": "business_name", "service_type": "primary_service", "agent_name": "agent_name"}'),
('Follow-up SMS', 'sms', NULL, 'Hi {{lead_name}}, following up on our conversation about {{service_type}}. When''s a good time to chat?', '{"lead_name": "name", "service_type": "primary_service"}'),
('Call Script - Follow-up', 'call_script', NULL, 'Hello {{lead_name}}, this is {{agent_name}} from {{business_name}}. I''m following up on our previous conversation about {{service_type}}. Do you have a few minutes to discuss how we can help?', '{"lead_name": "name", "agent_name": "agent_name", "business_name": "business_name", "service_type": "primary_service"}');

-- Create function to trigger follow-up sequence
CREATE OR REPLACE FUNCTION trigger_follow_up_sequence(
    p_lead_id INTEGER,
    p_client_key TEXT,
    p_trigger_type TEXT,
    p_trigger_data JSONB DEFAULT '{}'::jsonb
)
RETURNS INTEGER AS $$
DECLARE
    sequence_record RECORD;
    execution_id INTEGER;
BEGIN
    -- Find matching sequence
    SELECT * INTO sequence_record
    FROM follow_up_sequences
    WHERE client_key = p_client_key
    AND trigger_type = p_trigger_type
    AND is_active = true
    AND (trigger_conditions @> p_trigger_data OR trigger_conditions = '{}'::jsonb)
    ORDER BY priority DESC, created_at ASC
    LIMIT 1;
    
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;
    
    -- Check if execution already exists and is active
    IF EXISTS (
        SELECT 1 FROM follow_up_executions 
        WHERE lead_id = p_lead_id 
        AND sequence_id = sequence_record.id 
        AND status = 'active'
    ) THEN
        RETURN NULL;
    END IF;
    
    -- Create new execution
    INSERT INTO follow_up_executions (
        sequence_id, lead_id, client_key, trigger_data, status
    ) VALUES (
        sequence_record.id, p_lead_id, p_client_key, p_trigger_data, 'active'
    ) RETURNING id INTO execution_id;
    
    -- Schedule first step
    PERFORM schedule_follow_up_step(execution_id, 1);
    
    RETURN execution_id;
END;
$$ LANGUAGE plpgsql;

-- Create function to schedule follow-up step
CREATE OR REPLACE FUNCTION schedule_follow_up_step(
    p_execution_id INTEGER,
    p_step_order INTEGER
)
RETURNS VOID AS $$
DECLARE
    step_record RECORD;
    execution_record RECORD;
    scheduled_time TIMESTAMPTZ;
BEGIN
    -- Get execution details
    SELECT * INTO execution_record FROM follow_up_executions WHERE id = p_execution_id;
    
    -- Get step details
    SELECT * INTO step_record
    FROM follow_up_steps
    WHERE sequence_id = execution_record.sequence_id
    AND step_order = p_step_order
    AND is_active = true;
    
    IF NOT FOUND THEN
        -- No more steps, mark execution as completed
        UPDATE follow_up_executions 
        SET status = 'completed', completed_at = NOW()
        WHERE id = p_execution_id;
        RETURN;
    END IF;
    
    -- Calculate scheduled time
    scheduled_time := NOW() + 
        INTERVAL '1 hour' * step_record.delay_hours + 
        INTERVAL '1 day' * step_record.delay_days;
    
    -- Insert step execution
    INSERT INTO follow_up_step_executions (
        execution_id, step_id, step_order, scheduled_for, status
    ) VALUES (
        p_execution_id, step_record.id, p_step_order, scheduled_time, 'pending'
    );
END;
$$ LANGUAGE plpgsql;

-- Create function to process pending follow-up steps
CREATE OR REPLACE FUNCTION process_pending_follow_up_steps()
RETURNS INTEGER AS $$
DECLARE
    step_execution RECORD;
    processed_count INTEGER := 0;
BEGIN
    -- Get all pending steps that are due
    FOR step_execution IN 
        SELECT 
            fse.*,
            fs.step_type,
            fs.content,
            fs.subject,
            fs.template_variables,
            fe.lead_id,
            fe.client_key,
            l.name as lead_name,
            l.phone as lead_phone,
            l.email as lead_email,
            t.display_name as client_name
        FROM follow_up_step_executions fse
        JOIN follow_up_steps fs ON fse.step_id = fs.id
        JOIN follow_up_executions fe ON fse.execution_id = fe.id
        JOIN leads l ON fe.lead_id = l.id
        JOIN tenants t ON fe.client_key = t.client_key
        WHERE fse.status = 'pending'
        AND fse.scheduled_for <= NOW()
        ORDER BY fse.scheduled_for ASC
        LIMIT 50
    LOOP
        -- Process the step based on type
        CASE step_execution.step_type
            WHEN 'email' THEN
                PERFORM send_follow_up_email(step_execution);
            WHEN 'sms' THEN
                PERFORM send_follow_up_sms(step_execution);
            WHEN 'call' THEN
                PERFORM schedule_follow_up_call(step_execution);
            WHEN 'wait' THEN
                -- Just mark as executed and schedule next step
                UPDATE follow_up_step_executions 
                SET status = 'sent', executed_at = NOW()
                WHERE id = step_execution.id;
                
                -- Schedule next step
                PERFORM schedule_follow_up_step(step_execution.execution_id, step_execution.step_order + 1);
        END CASE;
        
        processed_count := processed_count + 1;
    END LOOP;
    
    RETURN processed_count;
END;
$$ LANGUAGE plpgsql;

-- Create function to send follow-up email
CREATE OR REPLACE FUNCTION send_follow_up_email(step_execution RECORD)
RETURNS VOID AS $$
DECLARE
    rendered_content TEXT;
    rendered_subject TEXT;
BEGIN
    -- Render template variables (simplified - in real implementation, use proper templating)
    rendered_content := step_execution.content;
    rendered_subject := COALESCE(step_execution.subject, 'Follow-up');
    
    -- Replace basic variables
    rendered_content := REPLACE(rendered_content, '{{lead_name}}', COALESCE(step_execution.lead_name, 'there'));
    rendered_content := REPLACE(rendered_content, '{{client_name}}', COALESCE(step_execution.client_name, 'our team'));
    
    rendered_subject := REPLACE(rendered_subject, '{{lead_name}}', COALESCE(step_execution.lead_name, 'there'));
    rendered_subject := REPLACE(rendered_subject, '{{client_name}}', COALESCE(step_execution.client_name, 'our team'));
    
    -- In a real implementation, you would:
    -- 1. Use a proper templating engine
    -- 2. Send the email via your email service (SendGrid, etc.)
    -- 3. Track delivery status
    
    -- For now, just mark as sent
    UPDATE follow_up_step_executions 
    SET 
        status = 'sent',
        executed_at = NOW(),
        delivery_method = 'email',
        external_id = 'email_' || step_execution.id
    WHERE id = step_execution.id;
    
    -- Schedule next step
    PERFORM schedule_follow_up_step(step_execution.execution_id, step_execution.step_order + 1);
END;
$$ LANGUAGE plpgsql;

-- Create function to send follow-up SMS
CREATE OR REPLACE FUNCTION send_follow_up_sms(step_execution RECORD)
RETURNS VOID AS $$
DECLARE
    rendered_content TEXT;
BEGIN
    -- Render template variables
    rendered_content := step_execution.content;
    rendered_content := REPLACE(rendered_content, '{{lead_name}}', COALESCE(step_execution.lead_name, 'there'));
    rendered_content := REPLACE(rendered_content, '{{client_name}}', COALESCE(step_execution.client_name, 'our team'));
    
    -- In a real implementation, you would:
    -- 1. Send SMS via Twilio
    -- 2. Track delivery status
    -- 3. Handle errors appropriately
    
    -- For now, just mark as sent
    UPDATE follow_up_step_executions 
    SET 
        status = 'sent',
        executed_at = NOW(),
        delivery_method = 'sms',
        external_id = 'sms_' || step_execution.id
    WHERE id = step_execution.id;
    
    -- Schedule next step
    PERFORM schedule_follow_up_step(step_execution.execution_id, step_execution.step_order + 1);
END;
$$ LANGUAGE plpgsql;

-- Create function to schedule follow-up call
CREATE OR REPLACE FUNCTION schedule_follow_up_call(step_execution RECORD)
RETURNS VOID AS $$
BEGIN
    -- In a real implementation, you would:
    -- 1. Add to call queue
    -- 2. Schedule with Vapi or similar service
    -- 3. Track call status
    
    -- For now, just mark as scheduled
    UPDATE follow_up_step_executions 
    SET 
        status = 'sent',
        executed_at = NOW(),
        delivery_method = 'call',
        external_id = 'call_' || step_execution.id
    WHERE id = step_execution.id;
    
    -- Schedule next step
    PERFORM schedule_follow_up_step(step_execution.execution_id, step_execution.step_order + 1);
END;
$$ LANGUAGE plpgsql;

-- Create function to get follow-up analytics
CREATE OR REPLACE FUNCTION get_follow_up_analytics(
    p_client_key TEXT,
    p_days_back INTEGER DEFAULT 30
)
RETURNS JSONB AS $$
DECLARE
    analytics JSONB;
BEGIN
    SELECT jsonb_build_object(
        'total_sequences', COUNT(DISTINCT fs.id),
        'active_executions', COUNT(CASE WHEN fe.status = 'active' THEN 1 END),
        'completed_executions', COUNT(CASE WHEN fe.status = 'completed' THEN 1 END),
        'total_steps_sent', COUNT(CASE WHEN fse.status = 'sent' THEN 1 END),
        'total_steps_failed', COUNT(CASE WHEN fse.status = 'failed' THEN 1 END),
        'avg_completion_rate', CASE WHEN COUNT(fe.id) > 0 THEN (COUNT(CASE WHEN fe.status = 'completed' THEN 1 END)::DECIMAL / COUNT(fe.id) * 100) ELSE 0 END,
        'avg_response_rate', CASE WHEN COUNT(fse.id) > 0 THEN (COUNT(CASE WHEN fse.status = 'delivered' THEN 1 END)::DECIMAL / COUNT(fse.id) * 100) ELSE 0 END
    ) INTO analytics
    FROM follow_up_sequences fs
    LEFT JOIN follow_up_executions fe ON fs.id = fe.sequence_id
    LEFT JOIN follow_up_step_executions fse ON fe.id = fse.execution_id
    WHERE fs.client_key = p_client_key
    AND fe.created_at >= NOW() - INTERVAL '1 day' * p_days_back;
    
    RETURN analytics;
END;
$$ LANGUAGE plpgsql;
