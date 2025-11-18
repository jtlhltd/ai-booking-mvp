-- Migration: Add inbound call support tables
-- Created: 2025-01-27
-- Purpose: Enable full receptionist functionality with inbound call handling

-- Inbound calls tracking
CREATE TABLE IF NOT EXISTS inbound_calls (
  id BIGSERIAL PRIMARY KEY,
  client_key TEXT NOT NULL,
  call_sid TEXT UNIQUE NOT NULL,
  from_phone TEXT NOT NULL,
  to_phone TEXT NOT NULL,
  vapi_call_id TEXT,
  status TEXT DEFAULT 'initiated',
  purpose TEXT, -- 'booking', 'question', 'reschedule', 'cancel', 'message', etc.
  outcome TEXT,
  duration INTEGER, -- seconds
  transcript TEXT,
  recording_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_inbound_calls_client ON inbound_calls(client_key);
CREATE INDEX IF NOT EXISTS idx_inbound_calls_phone ON inbound_calls(from_phone);
CREATE INDEX IF NOT EXISTS idx_inbound_calls_status ON inbound_calls(status);
CREATE INDEX IF NOT EXISTS idx_inbound_calls_created ON inbound_calls(created_at DESC);

-- Customer profiles for recognition
CREATE TABLE IF NOT EXISTS customer_profiles (
  id BIGSERIAL PRIMARY KEY,
  client_key TEXT NOT NULL,
  phone TEXT NOT NULL,
  name TEXT,
  email TEXT,
  preferences_json JSONB DEFAULT '{}',
  vip_status BOOLEAN DEFAULT FALSE,
  special_notes TEXT,
  last_interaction TIMESTAMPTZ,
  total_appointments INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_key, phone)
);

CREATE INDEX IF NOT EXISTS idx_customer_profiles_lookup ON customer_profiles(client_key, phone);
CREATE INDEX IF NOT EXISTS idx_customer_profiles_vip ON customer_profiles(client_key, vip_status) WHERE vip_status = TRUE;

-- Messages (voicemail/message taking)
CREATE TABLE IF NOT EXISTS messages (
  id BIGSERIAL PRIMARY KEY,
  client_key TEXT NOT NULL,
  call_id TEXT, -- References inbound_calls.call_sid
  caller_name TEXT,
  caller_phone TEXT NOT NULL,
  caller_email TEXT,
  reason TEXT,
  message_body TEXT,
  preferred_callback_time TIMESTAMPTZ,
  urgency TEXT DEFAULT 'normal', -- 'normal', 'urgent', 'emergency'
  status TEXT DEFAULT 'new', -- 'new', 'read', 'responded', 'archived'
  recipient_email TEXT,
  recipient_phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  responded_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_messages_client ON messages(client_key);
CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(client_key, status);
CREATE INDEX IF NOT EXISTS idx_messages_urgency ON messages(client_key, urgency) WHERE urgency IN ('urgent', 'emergency');

-- Business information (FAQ, hours, services)
CREATE TABLE IF NOT EXISTS business_info (
  id BIGSERIAL PRIMARY KEY,
  client_key TEXT UNIQUE NOT NULL,
  hours_json JSONB DEFAULT '{}',
  services_json JSONB DEFAULT '[]',
  policies_json JSONB DEFAULT '{}',
  location_json JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS business_faqs (
  id BIGSERIAL PRIMARY KEY,
  client_key TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category TEXT,
  priority INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_faqs_client ON business_faqs(client_key);
CREATE INDEX IF NOT EXISTS idx_faqs_category ON business_faqs(client_key, category);
CREATE INDEX IF NOT EXISTS idx_faqs_priority ON business_faqs(client_key, priority DESC);

-- Update appointments table to support rescheduling/cancellation
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'booked';
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS rescheduled_from_id BIGINT REFERENCES appointments(id);

CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(client_key, status);
CREATE INDEX IF NOT EXISTS idx_appointments_cancelled ON appointments(client_key, cancelled_at) WHERE cancelled_at IS NOT NULL;

-- Add inbound assistant configuration to tenants table
-- This will be stored in vapi_json, but we document the expected structure:
-- vapi_json.inboundAssistantId
-- vapi_json.inboundPhoneNumberId

COMMENT ON TABLE inbound_calls IS 'Tracks all inbound phone calls routed through the system';
COMMENT ON TABLE customer_profiles IS 'Customer profiles for recognition and personalization';
COMMENT ON TABLE messages IS 'Voicemail and messages taken when staff unavailable';
COMMENT ON TABLE business_info IS 'Business information (hours, services, location) for FAQ answering';
COMMENT ON TABLE business_faqs IS 'Frequently asked questions for AI assistant';
















