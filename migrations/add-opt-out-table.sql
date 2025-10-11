-- Create opt_out_list table for GDPR compliance and DNC management

CREATE TABLE IF NOT EXISTS opt_out_list (
  id BIGSERIAL PRIMARY KEY,
  phone TEXT NOT NULL UNIQUE,
  reason TEXT,
  opted_out_at TIMESTAMPTZ DEFAULT NOW(),
  active BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT
);

CREATE INDEX IF NOT EXISTS opt_out_phone_idx ON opt_out_list(phone) WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS opt_out_active_idx ON opt_out_list(active);

COMMENT ON TABLE opt_out_list IS 'Phone numbers that have opted out of communications';
COMMENT ON COLUMN opt_out_list.phone IS 'Normalized phone number in E.164 format';
COMMENT ON COLUMN opt_out_list.reason IS 'Reason for opt-out (user_request, compliance, etc.)';
COMMENT ON COLUMN opt_out_list.active IS 'Whether the opt-out is currently active';

