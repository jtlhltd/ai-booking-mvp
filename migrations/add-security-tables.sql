-- Create audit_logs table for security and compliance

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  client_key TEXT,
  action TEXT NOT NULL,
  details JSONB,
  user_id TEXT,
  ip_address TEXT,
  user_agent TEXT,
  result TEXT, -- success, error, warning
  error_message TEXT,
  logged_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_logs_client_idx ON audit_logs(client_key);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON audit_logs(action);
CREATE INDEX IF NOT EXISTS audit_logs_time_idx ON audit_logs(logged_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_result_idx ON audit_logs(result);

COMMENT ON TABLE audit_logs IS 'Audit trail for all client actions and system events';
COMMENT ON COLUMN audit_logs.action IS 'Action type (e.g., lead_import, call_initiated, config_updated)';
COMMENT ON COLUMN audit_logs.details IS 'JSON details of the action';
COMMENT ON COLUMN audit_logs.result IS 'Outcome of the action (success, error, warning)';

-- Create call_analytics table for tracking (if not exists)

CREATE TABLE IF NOT EXISTS call_analytics (
  id BIGSERIAL PRIMARY KEY,
  call_id TEXT NOT NULL UNIQUE,
  client_key TEXT NOT NULL,
  lead_phone TEXT NOT NULL,
  outcome TEXT, -- booked, not_interested, no_answer, voicemail, callback_requested
  duration_seconds INTEGER,
  cost NUMERIC(10, 4),
  appointment_booked BOOLEAN DEFAULT FALSE,
  appointment_time TIMESTAMPTZ,
  transcript TEXT,
  sentiment TEXT,
  tracked_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS call_analytics_client_idx ON call_analytics(client_key);
CREATE INDEX IF NOT EXISTS call_analytics_outcome_idx ON call_analytics(outcome);
CREATE INDEX IF NOT EXISTS call_analytics_time_idx ON call_analytics(tracked_at DESC);
CREATE INDEX IF NOT EXISTS call_analytics_booked_idx ON call_analytics(appointment_booked) WHERE appointment_booked = TRUE;

COMMENT ON TABLE call_analytics IS 'Call outcome tracking and analytics';
COMMENT ON COLUMN call_analytics.outcome IS 'Call outcome type';
COMMENT ON COLUMN call_analytics.sentiment IS 'Sentiment analysis result';

-- Create error_logs table (if not exists)

CREATE TABLE IF NOT EXISTS error_logs (
  id BIGSERIAL PRIMARY KEY,
  error_type TEXT NOT NULL,
  error_message TEXT NOT NULL,
  stack_trace TEXT,
  context JSONB,
  severity TEXT, -- error, warning, critical
  service TEXT, -- server, vapi, twilio, etc.
  user_id TEXT,
  logged_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS error_logs_type_idx ON error_logs(error_type);
CREATE INDEX IF NOT EXISTS error_logs_severity_idx ON error_logs(severity);
CREATE INDEX IF NOT EXISTS error_logs_service_idx ON error_logs(service);
CREATE INDEX IF NOT EXISTS error_logs_time_idx ON error_logs(logged_at DESC);

COMMENT ON TABLE error_logs IS 'System error logging and monitoring';
COMMENT ON COLUMN error_logs.severity IS 'Error severity level';
COMMENT ON COLUMN error_logs.context IS 'Additional context about the error';

