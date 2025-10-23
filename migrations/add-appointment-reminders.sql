-- Add appointment reminders system
-- This enables automated SMS reminders to reduce no-shows

CREATE TABLE IF NOT EXISTS appointment_reminders (
    id SERIAL PRIMARY KEY,
    appointment_id TEXT NOT NULL,
    client_key TEXT NOT NULL,
    lead_phone TEXT NOT NULL,
    appointment_time TIMESTAMPTZ NOT NULL,
    reminder_type TEXT NOT NULL CHECK (reminder_type IN ('confirmation', '24hour', '1hour')),
    scheduled_for TIMESTAMPTZ NOT NULL,
    sent_at TIMESTAMPTZ,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
    sms_sid TEXT,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_appointment_reminders_appointment_id ON appointment_reminders(appointment_id);
CREATE INDEX IF NOT EXISTS idx_appointment_reminders_client_key ON appointment_reminders(client_key);
CREATE INDEX IF NOT EXISTS idx_appointment_reminders_scheduled_for ON appointment_reminders(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_appointment_reminders_status ON appointment_reminders(status);
CREATE INDEX IF NOT EXISTS idx_appointment_reminders_type ON appointment_reminders(reminder_type);

-- Add reminder settings to clients table
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS reminder_settings JSONB DEFAULT '{
    "confirmation_enabled": true,
    "24hour_enabled": true,
    "1hour_enabled": true,
    "confirmation_template": "Hi! Your appointment is confirmed for {appointment_time}. We look forward to seeing you!",
    "24hour_template": "Reminder: You have an appointment tomorrow at {appointment_time}. Reply STOP to opt out.",
    "1hour_template": "Your appointment is in 1 hour at {appointment_time}. See you soon!"
}'::jsonb;
