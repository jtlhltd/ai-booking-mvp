-- Advanced Reporting System (Simplified)
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
    report_id INTEGER REFERENCES reports(id) ON DELETE CASCADE,
    execution_type TEXT NOT NULL CHECK (execution_type IN ('manual', 'scheduled', 'api')),
    status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    execution_time_ms INTEGER,
    error_message TEXT,
    result_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create report_subscriptions table
CREATE TABLE IF NOT EXISTS report_subscriptions (
    id SERIAL PRIMARY KEY,
    report_id INTEGER REFERENCES reports(id) ON DELETE CASCADE,
    client_key TEXT NOT NULL REFERENCES tenants(client_key) ON DELETE CASCADE,
    email TEXT NOT NULL,
    frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
    is_active BOOLEAN DEFAULT true,
    last_sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create report_templates table
CREATE TABLE IF NOT EXISTS report_templates (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    template_type TEXT NOT NULL CHECK (template_type IN ('standard', 'custom', 'system')),
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_public BOOLEAN DEFAULT false,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create report_metrics table
CREATE TABLE IF NOT EXISTS report_metrics (
    id SERIAL PRIMARY KEY,
    report_id INTEGER REFERENCES reports(id) ON DELETE CASCADE,
    metric_name TEXT NOT NULL,
    metric_value DECIMAL(15,4),
    metric_unit TEXT,
    metric_category TEXT,
    metadata JSONB,
    calculated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_reports_client_key ON reports(client_key);
CREATE INDEX IF NOT EXISTS idx_reports_type_category ON reports(report_type, category);
CREATE INDEX IF NOT EXISTS idx_reports_scheduled ON reports(is_scheduled) WHERE is_scheduled = true;
CREATE INDEX IF NOT EXISTS idx_report_executions_report_id ON report_executions(report_id);
CREATE INDEX IF NOT EXISTS idx_report_executions_status ON report_executions(status);
CREATE INDEX IF NOT EXISTS idx_report_subscriptions_client_key ON report_subscriptions(client_key);
CREATE INDEX IF NOT EXISTS idx_report_subscriptions_active ON report_subscriptions(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_report_metrics_report_id ON report_metrics(report_id);
CREATE INDEX IF NOT EXISTS idx_report_metrics_name ON report_metrics(metric_name);

-- Insert some default report templates
INSERT INTO report_templates (name, description, template_type, config, is_public) VALUES
('Lead Performance Dashboard', 'Comprehensive lead analytics and conversion metrics', 'standard', '{"data_sources": ["leads", "calls"], "metrics": ["total_leads", "conversion_rate", "call_success_rate"], "chart_type": "dashboard"}', true),
('Call Quality Report', 'Call performance and quality metrics', 'standard', '{"data_sources": ["calls"], "metrics": ["call_duration", "success_rate", "quality_score"], "chart_type": "line"}', true),
('Revenue Analytics', 'Revenue tracking and forecasting', 'standard', '{"data_sources": ["appointments", "revenue"], "metrics": ["total_revenue", "avg_booking_value", "revenue_trend"], "chart_type": "bar"}', true),
('Client Performance Summary', 'Overall client performance metrics', 'standard', '{"data_sources": ["clients", "leads", "calls"], "metrics": ["active_clients", "total_leads", "conversion_rate"], "chart_type": "summary"}', true),
('System Performance', 'System health and performance metrics', 'system', '{"data_sources": ["system_metrics"], "metrics": ["uptime", "response_time", "error_rate"], "chart_type": "gauge"}', true)
ON CONFLICT DO NOTHING;
