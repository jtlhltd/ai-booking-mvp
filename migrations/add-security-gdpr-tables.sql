-- Security and GDPR Compliance Tables

-- User accounts table (for authentication)
CREATE TABLE IF NOT EXISTS user_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(50),
  name VARCHAR(255),
  password_hash TEXT NOT NULL,
  client_key VARCHAR(100),
  role VARCHAR(50) DEFAULT 'user',
  two_factor_enabled BOOLEAN DEFAULT FALSE,
  two_factor_secret TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  deleted_at TIMESTAMPTZ,
  deletion_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_login_at TIMESTAMPTZ,
  FOREIGN KEY (client_key) REFERENCES tenants(client_key) ON DELETE CASCADE
);

-- Sessions table (for session management)
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  token TEXT UNIQUE NOT NULL,
  ip_address VARCHAR(50),
  user_agent TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (user_id) REFERENCES user_accounts(id) ON DELETE CASCADE
);

-- Audit logs table (for compliance)
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  client_key VARCHAR(100),
  action VARCHAR(100) NOT NULL,
  resource VARCHAR(255),
  details JSONB,
  ip_address VARCHAR(50),
  user_agent TEXT,
  success BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (user_id) REFERENCES user_accounts(id) ON DELETE SET NULL,
  FOREIGN KEY (client_key) REFERENCES tenants(client_key) ON DELETE CASCADE
);

-- Consent records table (for GDPR)
CREATE TABLE IF NOT EXISTS consent_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  client_key VARCHAR(100),
  consent_type VARCHAR(100) NOT NULL,
  granted BOOLEAN NOT NULL,
  ip_address VARCHAR(50),
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (user_id) REFERENCES user_accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (client_key) REFERENCES tenants(client_key) ON DELETE CASCADE
);

-- IP whitelist/blacklist table
CREATE TABLE IF NOT EXISTS ip_filters (
  id SERIAL PRIMARY KEY,
  ip_address VARCHAR(50) NOT NULL,
  filter_type VARCHAR(20) NOT NULL CHECK (filter_type IN ('whitelist', 'blacklist')),
  reason TEXT,
  created_by VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  UNIQUE(ip_address, filter_type)
);

-- Data deletion requests (for GDPR right to be forgotten)
CREATE TABLE IF NOT EXISTS data_deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  client_key VARCHAR(100),
  reason TEXT,
  status VARCHAR(50) DEFAULT 'pending',
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  completed_by VARCHAR(100),
  FOREIGN KEY (user_id) REFERENCES user_accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (client_key) REFERENCES tenants(client_key) ON DELETE CASCADE
);

-- Call recording consent (for legal compliance)
CREATE TABLE IF NOT EXISTS call_recording_consent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id INTEGER,
  phone VARCHAR(50) NOT NULL,
  consent_given BOOLEAN NOT NULL,
  consent_method VARCHAR(50),
  recording_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
);

-- Create indexes for performance
-- These will only succeed if the tables exist (which they should after CREATE TABLE statements above)
CREATE INDEX IF NOT EXISTS idx_user_accounts_email ON user_accounts(email);
CREATE INDEX IF NOT EXISTS idx_user_accounts_client_key ON user_accounts(client_key);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_client_key ON audit_logs(client_key);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_consent_records_user_id ON consent_records(user_id);
CREATE INDEX IF NOT EXISTS idx_consent_records_client_key ON consent_records(client_key);
CREATE INDEX IF NOT EXISTS idx_ip_filters_ip_address ON ip_filters(ip_address);
CREATE INDEX IF NOT EXISTS idx_data_deletion_requests_user_id ON data_deletion_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_data_deletion_requests_status ON data_deletion_requests(status);
CREATE INDEX IF NOT EXISTS idx_call_recording_consent_phone ON call_recording_consent(phone);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_user_accounts_updated_at BEFORE UPDATE ON user_accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

