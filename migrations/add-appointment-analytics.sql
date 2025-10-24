-- Appointment Analytics Dashboard System
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

-- Create appointment funnel tracking
CREATE TABLE IF NOT EXISTS appointment_funnel (
    id SERIAL PRIMARY KEY,
    client_key TEXT NOT NULL,
    date DATE NOT NULL,
    leads_generated INTEGER DEFAULT 0,
    calls_made INTEGER DEFAULT 0,
    appointments_scheduled INTEGER DEFAULT 0,
    appointments_confirmed INTEGER DEFAULT 0,
    appointments_completed INTEGER DEFAULT 0,
    appointments_no_show INTEGER DEFAULT 0,
    appointments_cancelled INTEGER DEFAULT 0,
    total_revenue DECIMAL(10,2) DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create appointment performance metrics
CREATE TABLE IF NOT EXISTS appointment_performance (
    id SERIAL PRIMARY KEY,
    client_key TEXT NOT NULL,
    metric_date DATE NOT NULL,
    total_appointments INTEGER DEFAULT 0,
    completed_appointments INTEGER DEFAULT 0,
    no_show_count INTEGER DEFAULT 0,
    cancellation_count INTEGER DEFAULT 0,
    reschedule_count INTEGER DEFAULT 0,
    no_show_rate DECIMAL(5,2) DEFAULT 0.00,
    completion_rate DECIMAL(5,2) DEFAULT 0.00,
    avg_appointment_duration DECIMAL(5,2) DEFAULT 0.00,
    peak_hour_appointments INTEGER DEFAULT 0,
    off_peak_appointments INTEGER DEFAULT 0,
    weekend_appointments INTEGER DEFAULT 0,
    weekday_appointments INTEGER DEFAULT 0,
    total_revenue DECIMAL(10,2) DEFAULT 0.00,
    avg_revenue_per_appointment DECIMAL(10,2) DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_appointment_analytics_client_key ON appointment_analytics(client_key);
CREATE INDEX IF NOT EXISTS idx_appointment_analytics_appointment_time ON appointment_analytics(appointment_time);
CREATE INDEX IF NOT EXISTS idx_appointment_analytics_status ON appointment_analytics(status);
CREATE INDEX IF NOT EXISTS idx_appointment_analytics_outcome ON appointment_analytics(outcome);
CREATE INDEX IF NOT EXISTS idx_appointment_funnel_client_date ON appointment_funnel(client_key, date);
CREATE INDEX IF NOT EXISTS idx_appointment_performance_client_date ON appointment_performance(client_key, metric_date);

-- Create function to calculate appointment metrics
CREATE OR REPLACE FUNCTION calculate_appointment_metrics(client_key TEXT, start_date DATE, end_date DATE)
RETURNS JSONB AS $$
DECLARE
    metrics JSONB;
    total_appointments INTEGER;
    completed_appointments INTEGER;
    no_show_count INTEGER;
    cancellation_count INTEGER;
    reschedule_count INTEGER;
    total_revenue DECIMAL(10,2);
    avg_duration DECIMAL(5,2);
    peak_hour_count INTEGER;
    off_peak_count INTEGER;
    weekend_count INTEGER;
    weekday_count INTEGER;
BEGIN
    -- Get basic appointment counts
    SELECT 
        COUNT(*),
        COUNT(CASE WHEN status = 'completed' THEN 1 END),
        COUNT(CASE WHEN status = 'no_show' THEN 1 END),
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END),
        COUNT(CASE WHEN reschedule_count > 0 THEN 1 END),
        COALESCE(SUM(revenue), 0),
        COALESCE(AVG(duration_minutes), 0)
    INTO total_appointments, completed_appointments, no_show_count, cancellation_count, reschedule_count, total_revenue, avg_duration
    FROM appointment_analytics 
    WHERE appointment_analytics.client_key = calculate_appointment_metrics.client_key
    AND DATE(appointment_time) BETWEEN start_date AND end_date;
    
    -- Get time-based metrics
    SELECT 
        COUNT(CASE WHEN EXTRACT(HOUR FROM appointment_time) BETWEEN 9 AND 17 THEN 1 END),
        COUNT(CASE WHEN EXTRACT(HOUR FROM appointment_time) NOT BETWEEN 9 AND 17 THEN 1 END),
        COUNT(CASE WHEN EXTRACT(DOW FROM appointment_time) IN (0, 6) THEN 1 END),
        COUNT(CASE WHEN EXTRACT(DOW FROM appointment_time) BETWEEN 1 AND 5 THEN 1 END)
    INTO peak_hour_count, off_peak_count, weekend_count, weekday_count
    FROM appointment_analytics 
    WHERE appointment_analytics.client_key = calculate_appointment_metrics.client_key
    AND DATE(appointment_time) BETWEEN start_date AND end_date;
    
    -- Build metrics JSON
    metrics := jsonb_build_object(
        'total_appointments', total_appointments,
        'completed_appointments', completed_appointments,
        'no_show_count', no_show_count,
        'cancellation_count', cancellation_count,
        'reschedule_count', reschedule_count,
        'no_show_rate', CASE WHEN total_appointments > 0 THEN (no_show_count::DECIMAL / total_appointments * 100) ELSE 0 END,
        'completion_rate', CASE WHEN total_appointments > 0 THEN (completed_appointments::DECIMAL / total_appointments * 100) ELSE 0 END,
        'avg_duration', avg_duration,
        'peak_hour_appointments', peak_hour_count,
        'off_peak_appointments', off_peak_count,
        'weekend_appointments', weekend_count,
        'weekday_appointments', weekday_count,
        'total_revenue', total_revenue,
        'avg_revenue_per_appointment', CASE WHEN total_appointments > 0 THEN (total_revenue / total_appointments) ELSE 0 END
    );
    
    RETURN metrics;
END;
$$ LANGUAGE plpgsql;

-- Create function to update appointment funnel
CREATE OR REPLACE FUNCTION update_appointment_funnel(client_key TEXT, funnel_date DATE)
RETURNS VOID AS $$
DECLARE
    funnel_data RECORD;
BEGIN
    -- Get funnel data for the date
    SELECT 
        COUNT(DISTINCT l.id) as leads_generated,
        COUNT(DISTINCT c.id) as calls_made,
        COUNT(DISTINCT aa.id) as appointments_scheduled,
        COUNT(CASE WHEN aa.status IN ('confirmed', 'completed') THEN 1 END) as appointments_confirmed,
        COUNT(CASE WHEN aa.status = 'completed' THEN 1 END) as appointments_completed,
        COUNT(CASE WHEN aa.status = 'no_show' THEN 1 END) as appointments_no_show,
        COUNT(CASE WHEN aa.status = 'cancelled' THEN 1 END) as appointments_cancelled,
        COALESCE(SUM(aa.revenue), 0) as total_revenue
    INTO funnel_data
    FROM leads l
    LEFT JOIN calls c ON l.id = c.lead_id AND DATE(c.created_at) = funnel_date
    LEFT JOIN appointment_analytics aa ON l.id = aa.lead_id AND DATE(aa.appointment_time) = funnel_date
    WHERE l.client_key = update_appointment_funnel.client_key
    AND DATE(l.created_at) = funnel_date;
    
    -- Insert or update funnel record
    INSERT INTO appointment_funnel (
        client_key, date, leads_generated, calls_made, appointments_scheduled,
        appointments_confirmed, appointments_completed, appointments_no_show,
        appointments_cancelled, total_revenue
    ) VALUES (
        client_key, funnel_date, funnel_data.leads_generated, funnel_data.calls_made,
        funnel_data.appointments_scheduled, funnel_data.appointments_confirmed,
        funnel_data.appointments_completed, funnel_data.appointments_no_show,
        funnel_data.appointments_cancelled, funnel_data.total_revenue
    )
    ON CONFLICT (client_key, date) 
    DO UPDATE SET
        leads_generated = EXCLUDED.leads_generated,
        calls_made = EXCLUDED.calls_made,
        appointments_scheduled = EXCLUDED.appointments_scheduled,
        appointments_confirmed = EXCLUDED.appointments_confirmed,
        appointments_completed = EXCLUDED.appointments_completed,
        appointments_no_show = EXCLUDED.appointments_no_show,
        appointments_cancelled = EXCLUDED.appointments_cancelled,
        total_revenue = EXCLUDED.total_revenue;
END;
$$ LANGUAGE plpgsql;

-- Create function to get appointment insights
CREATE OR REPLACE FUNCTION get_appointment_insights(client_key TEXT, days_back INTEGER DEFAULT 30)
RETURNS JSONB AS $$
DECLARE
    insights JSONB;
    best_hour INTEGER;
    best_day INTEGER;
    worst_hour INTEGER;
    worst_day INTEGER;
    avg_no_show_rate DECIMAL(5,2);
    industry_benchmark DECIMAL(5,2) := 15.0; -- Industry average no-show rate
BEGIN
    -- Find best and worst performing hours
    SELECT 
        EXTRACT(HOUR FROM appointment_time)::INTEGER
    INTO best_hour
    FROM appointment_analytics 
    WHERE appointment_analytics.client_key = get_appointment_insights.client_key
    AND appointment_time >= NOW() - INTERVAL '1 day' * days_back
    GROUP BY EXTRACT(HOUR FROM appointment_time)
    ORDER BY COUNT(CASE WHEN status = 'completed' THEN 1 END) DESC, COUNT(*) DESC
    LIMIT 1;
    
    SELECT 
        EXTRACT(HOUR FROM appointment_time)::INTEGER
    INTO worst_hour
    FROM appointment_analytics 
    WHERE appointment_analytics.client_key = get_appointment_insights.client_key
    AND appointment_time >= NOW() - INTERVAL '1 day' * days_back
    GROUP BY EXTRACT(HOUR FROM appointment_time)
    ORDER BY COUNT(CASE WHEN status = 'no_show' THEN 1 END) DESC, COUNT(*) ASC
    LIMIT 1;
    
    -- Find best and worst performing days
    SELECT 
        EXTRACT(DOW FROM appointment_time)::INTEGER
    INTO best_day
    FROM appointment_analytics 
    WHERE appointment_analytics.client_key = get_appointment_insights.client_key
    AND appointment_time >= NOW() - INTERVAL '1 day' * days_back
    GROUP BY EXTRACT(DOW FROM appointment_time)
    ORDER BY COUNT(CASE WHEN status = 'completed' THEN 1 END) DESC, COUNT(*) DESC
    LIMIT 1;
    
    SELECT 
        EXTRACT(DOW FROM appointment_time)::INTEGER
    INTO worst_day
    FROM appointment_analytics 
    WHERE appointment_analytics.client_key = get_appointment_insights.client_key
    AND appointment_time >= NOW() - INTERVAL '1 day' * days_back
    GROUP BY EXTRACT(DOW FROM appointment_time)
    ORDER BY COUNT(CASE WHEN status = 'no_show' THEN 1 END) DESC, COUNT(*) ASC
    LIMIT 1;
    
    -- Calculate average no-show rate
    SELECT 
        CASE WHEN COUNT(*) > 0 THEN (COUNT(CASE WHEN status = 'no_show' THEN 1 END)::DECIMAL / COUNT(*) * 100) ELSE 0 END
    INTO avg_no_show_rate
    FROM appointment_analytics 
    WHERE appointment_analytics.client_key = get_appointment_insights.client_key
    AND appointment_time >= NOW() - INTERVAL '1 day' * days_back;
    
    -- Build insights JSON
    insights := jsonb_build_object(
        'best_hour', best_hour,
        'worst_hour', worst_hour,
        'best_day', best_day,
        'worst_day', worst_day,
        'avg_no_show_rate', avg_no_show_rate,
        'industry_benchmark', industry_benchmark,
        'performance_vs_benchmark', avg_no_show_rate - industry_benchmark,
        'recommendations', jsonb_build_array(
            CASE WHEN avg_no_show_rate > industry_benchmark THEN 'Consider implementing reminder system' ELSE 'No-show rate is below industry average' END,
            CASE WHEN best_hour IS NOT NULL THEN 'Peak performance hour: ' || best_hour || ':00' ELSE 'Insufficient data for hour analysis' END,
            CASE WHEN best_day IS NOT NULL THEN 'Best day: ' || CASE best_day WHEN 0 THEN 'Sunday' WHEN 1 THEN 'Monday' WHEN 2 THEN 'Tuesday' WHEN 3 THEN 'Wednesday' WHEN 4 THEN 'Thursday' WHEN 5 THEN 'Friday' WHEN 6 THEN 'Saturday' END ELSE 'Insufficient data for day analysis' END
        )
    );
    
    RETURN insights;
END;
$$ LANGUAGE plpgsql;

-- Add unique constraint for funnel data
ALTER TABLE appointment_funnel ADD CONSTRAINT unique_client_date UNIQUE (client_key, date);
