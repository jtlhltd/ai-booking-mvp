-- Appointment Analytics Dashboard System (Simplified)
-- This enables comprehensive appointment analytics and insights

-- Create appointment analytics tables
CREATE TABLE IF NOT EXISTS appointment_analytics (
    id SERIAL PRIMARY KEY,
    appointment_id TEXT NOT NULL,
    client_key TEXT NOT NULL,
    lead_id INTEGER REFERENCES leads(id),
    appointment_time TIMESTAMPTZ NOT NULL,
    duration_minutes INTEGER DEFAULT 30,
    status TEXT NOT NULL CHECK (status IN ('scheduled', 'confirmed', 'completed', 'no_show', 'cancelled', 'rescheduled')),
    outcome TEXT CHECK (outcome IN ('booked', 'interested', 'not_interested', 'callback_requested', 'follow_up_needed')),
    revenue DECIMAL(10,2) DEFAULT 0.00,
    service_type TEXT,
    booking_source TEXT,
    confirmation_sent BOOLEAN DEFAULT false,
    reminder_sent_24h BOOLEAN DEFAULT false,
    reminder_sent_1h BOOLEAN DEFAULT false,
    no_show_reason TEXT,
    cancellation_reason TEXT,
    reschedule_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create appointment_funnel table for conversion tracking
CREATE TABLE IF NOT EXISTS appointment_funnel (
    id SERIAL PRIMARY KEY,
    client_key TEXT NOT NULL,
    date DATE NOT NULL,
    total_appointments INTEGER DEFAULT 0,
    confirmed_appointments INTEGER DEFAULT 0,
    completed_appointments INTEGER DEFAULT 0,
    no_show_appointments INTEGER DEFAULT 0,
    cancelled_appointments INTEGER DEFAULT 0,
    rescheduled_appointments INTEGER DEFAULT 0,
    total_revenue DECIMAL(10,2) DEFAULT 0.00,
    avg_duration_minutes DECIMAL(5,2) DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(client_key, date)
);

-- Create appointment_performance table for metrics
CREATE TABLE IF NOT EXISTS appointment_performance (
    id SERIAL PRIMARY KEY,
    client_key TEXT NOT NULL,
    metric_date DATE NOT NULL,
    metric_name TEXT NOT NULL,
    metric_value DECIMAL(15,4),
    metric_unit TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(client_key, metric_date, metric_name)
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_appointment_analytics_client_key ON appointment_analytics(client_key);
CREATE INDEX IF NOT EXISTS idx_appointment_analytics_appointment_time ON appointment_analytics(appointment_time);
CREATE INDEX IF NOT EXISTS idx_appointment_analytics_status ON appointment_analytics(status);
CREATE INDEX IF NOT EXISTS idx_appointment_analytics_outcome ON appointment_analytics(outcome);
CREATE INDEX IF NOT EXISTS idx_appointment_funnel_client_date ON appointment_funnel(client_key, date);
CREATE INDEX IF NOT EXISTS idx_appointment_performance_client_date ON appointment_performance(client_key, metric_date);

-- Insert some sample appointment analytics data
-- Insert sample data only if leads exist (skip if they don't)
DO $$
BEGIN
    -- Only insert if at least one lead exists
    IF EXISTS (SELECT 1 FROM leads LIMIT 1) THEN
        INSERT INTO appointment_analytics (appointment_id, client_key, lead_id, appointment_time, duration_minutes, status, outcome, revenue, service_type, booking_source) 
        SELECT 
            'apt_001', 
            'test_beauty_salon', 
            (SELECT id FROM leads LIMIT 1), 
            NOW() - INTERVAL '1 day', 
            30, 
            'completed', 
            'booked', 
            150.00, 
            'consultation', 
            'phone'
        WHERE NOT EXISTS (SELECT 1 FROM appointment_analytics WHERE appointment_id = 'apt_001')
        ON CONFLICT DO NOTHING;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        -- If insert fails for any reason, just log and continue
        RAISE NOTICE 'Could not insert appointment analytics sample data: %', SQLERRM;
END $$;
