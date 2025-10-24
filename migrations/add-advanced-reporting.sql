-- Advanced Reporting System
-- This enables comprehensive reporting and analytics with custom report builder

-- Create reports table
CREATE TABLE IF NOT EXISTS reports (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    report_type TEXT NOT NULL CHECK (report_type IN ('dashboard', 'analytics', 'performance', 'custom', 'scheduled')),
    category TEXT NOT NULL CHECK (category IN ('leads', 'calls', 'appointments', 'followups', 'revenue', 'clients', 'system')),
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    filters JSONB DEFAULT '{}'::jsonb,
    chart_config JSONB DEFAULT '{}'::jsonb,
    is_public BOOLEAN DEFAULT false,
    is_scheduled BOOLEAN DEFAULT false,
    schedule_config JSONB DEFAULT '{}'::jsonb,
    client_key TEXT REFERENCES tenants(client_key) ON DELETE CASCADE,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_run_at TIMESTAMPTZ
);

-- Create report_executions table
CREATE TABLE IF NOT EXISTS report_executions (
    id SERIAL PRIMARY KEY,
    report_id INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    execution_type TEXT NOT NULL CHECK (execution_type IN ('manual', 'scheduled', 'api')),
    status TEXT DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    execution_time_ms INTEGER,
    record_count INTEGER DEFAULT 0,
    error_message TEXT,
    output_format TEXT CHECK (output_format IN ('json', 'csv', 'pdf', 'excel')),
    file_path TEXT,
    created_by TEXT,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Create report_subscriptions table
CREATE TABLE IF NOT EXISTS report_subscriptions (
    id SERIAL PRIMARY KEY,
    report_id INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    subscriber_email TEXT NOT NULL,
    subscriber_name TEXT,
    frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly', 'quarterly')),
    delivery_time TIME DEFAULT '09:00:00',
    is_active BOOLEAN DEFAULT true,
    last_delivered_at TIMESTAMPTZ,
    delivery_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create report_templates table
CREATE TABLE IF NOT EXISTS report_templates (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    template_type TEXT NOT NULL CHECK (template_type IN ('standard', 'custom', 'dashboard')),
    category TEXT NOT NULL,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_system BOOLEAN DEFAULT false,
    usage_count INTEGER DEFAULT 0,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create report_metrics table
CREATE TABLE IF NOT EXISTS report_metrics (
    id SERIAL PRIMARY KEY,
    report_id INTEGER REFERENCES reports(id) ON DELETE CASCADE,
    metric_name TEXT NOT NULL,
    metric_type TEXT NOT NULL CHECK (metric_type IN ('count', 'sum', 'avg', 'percentage', 'trend', 'ratio')),
    metric_value DECIMAL(15,4) NOT NULL,
    metric_unit TEXT,
    comparison_value DECIMAL(15,4),
    comparison_period TEXT,
    calculated_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_reports_client_key ON reports(client_key);
CREATE INDEX IF NOT EXISTS idx_reports_category ON reports(category);
CREATE INDEX IF NOT EXISTS idx_reports_type ON reports(report_type);
CREATE INDEX IF NOT EXISTS idx_reports_scheduled ON reports(is_scheduled);
CREATE INDEX IF NOT EXISTS idx_report_executions_report_id ON report_executions(report_id);
CREATE INDEX IF NOT EXISTS idx_report_executions_status ON report_executions(status);
CREATE INDEX IF NOT EXISTS idx_report_executions_started_at ON report_executions(started_at);
CREATE INDEX IF NOT EXISTS idx_report_subscriptions_report_id ON report_subscriptions(report_id);
CREATE INDEX IF NOT EXISTS idx_report_subscriptions_email ON report_subscriptions(subscriber_email);
CREATE INDEX IF NOT EXISTS idx_report_templates_category ON report_templates(category);
CREATE INDEX IF NOT EXISTS idx_report_metrics_report_id ON report_metrics(report_id);

-- Insert default report templates
INSERT INTO report_templates (name, description, template_type, category, config, is_system) VALUES
-- Lead Reports
('Lead Conversion Funnel', 'Complete lead-to-appointment conversion analysis', 'standard', 'leads', '{"data_sources": ["leads", "calls", "appointments"], "metrics": ["total_leads", "calls_made", "appointments_scheduled", "conversion_rate"], "chart_type": "funnel"}', true),
('Lead Source Performance', 'Performance analysis by lead source', 'standard', 'leads', '{"data_sources": ["leads"], "metrics": ["count", "conversion_rate", "avg_score"], "group_by": "source", "chart_type": "bar"}', true),
('Lead Scoring Analysis', 'Lead scoring distribution and performance', 'standard', 'leads', '{"data_sources": ["leads"], "metrics": ["score_distribution", "avg_score", "high_score_percentage"], "chart_type": "histogram"}', true),

-- Call Reports
('Call Performance Dashboard', 'Comprehensive call analytics and metrics', 'dashboard', 'calls', '{"data_sources": ["calls"], "metrics": ["total_calls", "avg_duration", "success_rate", "quality_score"], "chart_type": "mixed"}', true),
('Call Quality Trends', 'Call quality trends over time', 'standard', 'calls', '{"data_sources": ["calls"], "metrics": ["avg_quality", "quality_distribution"], "time_grouping": "daily", "chart_type": "line"}', true),
('Call Outcome Analysis', 'Analysis of call outcomes and patterns', 'standard', 'calls', '{"data_sources": ["calls"], "metrics": ["outcome_distribution", "success_rate"], "group_by": "outcome", "chart_type": "pie"}', true),

-- Appointment Reports
('Appointment Analytics', 'Complete appointment performance analysis', 'dashboard', 'appointments', '{"data_sources": ["appointments"], "metrics": ["total_appointments", "completion_rate", "no_show_rate", "revenue"], "chart_type": "mixed"}', true),
('No-Show Analysis', 'Detailed no-show patterns and prevention', 'standard', 'appointments', '{"data_sources": ["appointments"], "metrics": ["no_show_rate", "no_show_patterns", "prevention_metrics"], "chart_type": "bar"}', true),
('Revenue Tracking', 'Appointment revenue and financial metrics', 'standard', 'revenue', '{"data_sources": ["appointments"], "metrics": ["total_revenue", "avg_revenue", "revenue_trends"], "time_grouping": "monthly", "chart_type": "line"}', true),

-- Follow-up Reports
('Follow-up Performance', 'Follow-up sequence effectiveness analysis', 'standard', 'followups', '{"data_sources": ["follow_up_executions"], "metrics": ["completion_rate", "response_rate", "sequence_performance"], "chart_type": "bar"}', true),
('Email Campaign Analytics', 'Email follow-up performance metrics', 'standard', 'followups', '{"data_sources": ["follow_up_step_executions"], "metrics": ["open_rate", "click_rate", "response_rate"], "chart_type": "line"}', true),

-- Client Reports
('Client Performance Dashboard', 'Comprehensive client analytics', 'dashboard', 'clients', '{"data_sources": ["tenants", "leads", "appointments"], "metrics": ["total_clients", "active_clients", "avg_performance"], "chart_type": "mixed"}', true),
('Client Growth Analysis', 'Client acquisition and growth trends', 'standard', 'clients', '{"data_sources": ["tenants"], "metrics": ["new_clients", "growth_rate", "retention_rate"], "time_grouping": "monthly", "chart_type": "line"}', true),

-- System Reports
('System Performance', 'System health and performance metrics', 'standard', 'system', '{"data_sources": ["system_metrics"], "metrics": ["uptime", "response_time", "error_rate"], "chart_type": "gauge"}', true);

-- Create function to generate report data
CREATE OR REPLACE FUNCTION generate_report_data(
    p_report_id INTEGER,
    p_start_date DATE DEFAULT NULL,
    p_end_date DATE DEFAULT NULL,
    p_filters JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB AS $$
DECLARE
    report_record RECORD;
    report_data JSONB;
    query_result RECORD;
    metric_value DECIMAL(15,4);
BEGIN
    -- Get report configuration
    SELECT * INTO report_record FROM reports WHERE id = p_report_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'Report not found');
    END IF;
    
    -- Initialize report data structure
    report_data := jsonb_build_object(
        'report_id', p_report_id,
        'report_name', report_record.name,
        'generated_at', NOW(),
        'data_period', jsonb_build_object(
            'start_date', COALESCE(p_start_date, CURRENT_DATE - INTERVAL '30 days'),
            'end_date', COALESCE(p_end_date, CURRENT_DATE)
        ),
        'metrics', jsonb_build_object(),
        'charts', jsonb_build_array(),
        'summary', jsonb_build_object()
    );
    
    -- Generate metrics based on report configuration
    CASE report_record.category
        WHEN 'leads' THEN
            -- Lead metrics
            SELECT COUNT(*) INTO metric_value FROM leads 
            WHERE created_at >= COALESCE(p_start_date, CURRENT_DATE - INTERVAL '30 days')
            AND created_at <= COALESCE(p_end_date, CURRENT_DATE);
            report_data := jsonb_set(report_data, '{metrics,total_leads}', to_jsonb(metric_value));
            
            SELECT AVG(score) INTO metric_value FROM leads 
            WHERE created_at >= COALESCE(p_start_date, CURRENT_DATE - INTERVAL '30 days')
            AND created_at <= COALESCE(p_end_date, CURRENT_DATE);
            report_data := jsonb_set(report_data, '{metrics,avg_score}', to_jsonb(COALESCE(metric_value, 0)));
            
        WHEN 'calls' THEN
            -- Call metrics
            SELECT COUNT(*) INTO metric_value FROM calls 
            WHERE created_at >= COALESCE(p_start_date, CURRENT_DATE - INTERVAL '30 days')
            AND created_at <= COALESCE(p_end_date, CURRENT_DATE);
            report_data := jsonb_set(report_data, '{metrics,total_calls}', to_jsonb(metric_value));
            
            SELECT AVG(duration) INTO metric_value FROM calls 
            WHERE created_at >= COALESCE(p_start_date, CURRENT_DATE - INTERVAL '30 days')
            AND created_at <= COALESCE(p_end_date, CURRENT_DATE);
            report_data := jsonb_set(report_data, '{metrics,avg_duration}', to_jsonb(COALESCE(metric_value, 0)));
            
        WHEN 'appointments' THEN
            -- Appointment metrics
            SELECT COUNT(*) INTO metric_value FROM appointment_analytics 
            WHERE appointment_time >= COALESCE(p_start_date, CURRENT_DATE - INTERVAL '30 days')
            AND appointment_time <= COALESCE(p_end_date, CURRENT_DATE);
            report_data := jsonb_set(report_data, '{metrics,total_appointments}', to_jsonb(metric_value));
            
            SELECT AVG(revenue) INTO metric_value FROM appointment_analytics 
            WHERE appointment_time >= COALESCE(p_start_date, CURRENT_DATE - INTERVAL '30 days')
            AND appointment_time <= COALESCE(p_end_date, CURRENT_DATE);
            report_data := jsonb_set(report_data, '{metrics,avg_revenue}', to_jsonb(COALESCE(metric_value, 0)));
            
        WHEN 'followups' THEN
            -- Follow-up metrics
            SELECT COUNT(*) INTO metric_value FROM follow_up_executions 
            WHERE started_at >= COALESCE(p_start_date, CURRENT_DATE - INTERVAL '30 days')
            AND started_at <= COALESCE(p_end_date, CURRENT_DATE);
            report_data := jsonb_set(report_data, '{metrics,total_executions}', to_jsonb(metric_value));
            
            SELECT COUNT(CASE WHEN status = 'completed' THEN 1 END)::DECIMAL / COUNT(*) * 100 INTO metric_value 
            FROM follow_up_executions 
            WHERE started_at >= COALESCE(p_start_date, CURRENT_DATE - INTERVAL '30 days')
            AND started_at <= COALESCE(p_end_date, CURRENT_DATE);
            report_data := jsonb_set(report_data, '{metrics,completion_rate}', to_jsonb(COALESCE(metric_value, 0)));
            
        WHEN 'clients' THEN
            -- Client metrics
            SELECT COUNT(*) INTO metric_value FROM tenants;
            report_data := jsonb_set(report_data, '{metrics,total_clients}', to_jsonb(metric_value));
            
            SELECT COUNT(CASE WHEN is_active = true THEN 1 END) INTO metric_value FROM tenants;
            report_data := jsonb_set(report_data, '{metrics,active_clients}', to_jsonb(metric_value));
            
        WHEN 'revenue' THEN
            -- Revenue metrics
            SELECT SUM(revenue) INTO metric_value FROM appointment_analytics 
            WHERE appointment_time >= COALESCE(p_start_date, CURRENT_DATE - INTERVAL '30 days')
            AND appointment_time <= COALESCE(p_end_date, CURRENT_DATE);
            report_data := jsonb_set(report_data, '{metrics,total_revenue}', to_jsonb(COALESCE(metric_value, 0)));
            
            SELECT AVG(revenue) INTO metric_value FROM appointment_analytics 
            WHERE appointment_time >= COALESCE(p_start_date, CURRENT_DATE - INTERVAL '30 days')
            AND appointment_time <= COALESCE(p_end_date, CURRENT_DATE);
            report_data := jsonb_set(report_data, '{metrics,avg_revenue}', to_jsonb(COALESCE(metric_value, 0)));
    END CASE;
    
    -- Add summary insights
    report_data := jsonb_set(report_data, '{summary}', jsonb_build_object(
        'generated_at', NOW(),
        'data_points', jsonb_object_keys(report_data->'metrics'),
        'period_days', EXTRACT(DAYS FROM (COALESCE(p_end_date, CURRENT_DATE) - COALESCE(p_start_date, CURRENT_DATE - INTERVAL '30 days')))
    ));
    
    RETURN report_data;
END;
$$ LANGUAGE plpgsql;

-- Create function to execute scheduled reports
CREATE OR REPLACE FUNCTION execute_scheduled_reports()
RETURNS INTEGER AS $$
DECLARE
    report_record RECORD;
    execution_id INTEGER;
    processed_count INTEGER := 0;
BEGIN
    -- Get all scheduled reports that need to run
    FOR report_record IN 
        SELECT r.* FROM reports r
        WHERE r.is_scheduled = true
        AND (
            r.last_run_at IS NULL 
            OR r.last_run_at < NOW() - INTERVAL '1 day'
            OR (r.schedule_config->>'frequency' = 'weekly' AND r.last_run_at < NOW() - INTERVAL '7 days')
            OR (r.schedule_config->>'frequency' = 'monthly' AND r.last_run_at < NOW() - INTERVAL '30 days')
        )
    LOOP
        -- Create execution record
        INSERT INTO report_executions (
            report_id, execution_type, status, started_at
        ) VALUES (
            report_record.id, 'scheduled', 'running', NOW()
        ) RETURNING id INTO execution_id;
        
        -- Generate report data
        PERFORM generate_report_data(report_record.id);
        
        -- Update execution status
        UPDATE report_executions 
        SET 
            status = 'completed',
            completed_at = NOW(),
            execution_time_ms = EXTRACT(MILLISECONDS FROM (NOW() - started_at))::INTEGER
        WHERE id = execution_id;
        
        -- Update report last run time
        UPDATE reports 
        SET last_run_at = NOW()
        WHERE id = report_record.id;
        
        processed_count := processed_count + 1;
    END LOOP;
    
    RETURN processed_count;
END;
$$ LANGUAGE plpgsql;

-- Create function to get report analytics
CREATE OR REPLACE FUNCTION get_report_analytics(
    p_client_key TEXT,
    p_days_back INTEGER DEFAULT 30
)
RETURNS JSONB AS $$
DECLARE
    analytics JSONB;
BEGIN
    SELECT jsonb_build_object(
        'total_reports', COUNT(*),
        'scheduled_reports', COUNT(CASE WHEN is_scheduled = true THEN 1 END),
        'public_reports', COUNT(CASE WHEN is_public = true THEN 1 END),
        'total_executions', (
            SELECT COUNT(*) FROM report_executions re 
            JOIN reports r ON re.report_id = r.id 
            WHERE r.client_key = p_client_key
            AND re.started_at >= NOW() - INTERVAL '1 day' * p_days_back
        ),
        'successful_executions', (
            SELECT COUNT(*) FROM report_executions re 
            JOIN reports r ON re.report_id = r.id 
            WHERE r.client_key = p_client_key
            AND re.status = 'completed'
            AND re.started_at >= NOW() - INTERVAL '1 day' * p_days_back
        ),
        'avg_execution_time', (
            SELECT AVG(execution_time_ms) FROM report_executions re 
            JOIN reports r ON re.report_id = r.id 
            WHERE r.client_key = p_client_key
            AND re.status = 'completed'
            AND re.started_at >= NOW() - INTERVAL '1 day' * p_days_back
        )
    ) INTO analytics
    FROM reports 
    WHERE client_key = p_client_key;
    
    RETURN analytics;
END;
$$ LANGUAGE plpgsql;
