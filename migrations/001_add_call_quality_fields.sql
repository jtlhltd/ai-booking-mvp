-- Migration: Add call quality analysis fields to calls table
-- This adds columns for transcript storage, sentiment analysis, and quality scoring

-- Add transcript and recording fields
ALTER TABLE calls ADD COLUMN IF NOT EXISTS transcript TEXT;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS recording_url TEXT;

-- Add quality analysis fields
ALTER TABLE calls ADD COLUMN IF NOT EXISTS sentiment TEXT;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS quality_score INTEGER;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS objections JSONB;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS key_phrases JSONB;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS metrics JSONB;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS analyzed_at TIMESTAMPTZ;

-- Add indexes for quality queries
CREATE INDEX IF NOT EXISTS calls_quality_idx ON calls(client_key, quality_score) WHERE quality_score IS NOT NULL;
CREATE INDEX IF NOT EXISTS calls_sentiment_idx ON calls(client_key, sentiment) WHERE sentiment IS NOT NULL;

-- Create quality_alerts table
CREATE TABLE IF NOT EXISTS quality_alerts (
  id BIGSERIAL PRIMARY KEY,
  client_key TEXT NOT NULL REFERENCES tenants(client_key) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  metric TEXT,
  actual_value TEXT,
  expected_value TEXT,
  message TEXT NOT NULL,
  action TEXT,
  impact TEXT,
  metadata JSONB,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS quality_alerts_client_created_idx ON quality_alerts(client_key, created_at DESC);
CREATE INDEX IF NOT EXISTS quality_alerts_unresolved_idx ON quality_alerts(client_key) WHERE resolved = FALSE;

