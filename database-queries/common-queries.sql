-- AI Booking System - Common Database Queries
-- Use with PostgreSQL extension: Ctrl+Shift+P -> "SQLTools: Run Query"

-- Check all clients/tenants
SELECT client_key, name, industry, status, created_at 
FROM tenants 
ORDER BY created_at DESC;

-- Get recent leads with call status
SELECT 
    l.name, 
    l.phone, 
    l.email, 
    l.source, 
    l.status,
    l.created_at,
    COUNT(c.id) as call_count,
    MAX(c.created_at) as last_call
FROM leads l
LEFT JOIN calls c ON l.id = c.lead_id
WHERE l.client_key = 'stay-focused-fitness-chris'
GROUP BY l.id, l.name, l.phone, l.email, l.source, l.status, l.created_at
ORDER BY l.created_at DESC
LIMIT 20;

-- Check appointment booking success rate
SELECT 
    DATE(created_at) as date,
    COUNT(*) as total_calls,
    COUNT(CASE WHEN outcome = 'appointment_booked' THEN 1 END) as bookings,
    ROUND(
        COUNT(CASE WHEN outcome = 'appointment_booked' THEN 1 END) * 100.0 / COUNT(*), 
        2
    ) as booking_rate_percent
FROM calls 
WHERE client_key = 'stay-focused-fitness-chris'
    AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- Check system health
SELECT 
    'leads' as table_name, COUNT(*) as count 
FROM leads
UNION ALL
SELECT 
    'calls' as table_name, COUNT(*) as count 
FROM calls
UNION ALL
SELECT 
    'appointments' as table_name, COUNT(*) as count 
FROM appointments;

-- Find leads that need follow-up
SELECT 
    l.name,
    l.phone,
    l.status,
    l.created_at,
    MAX(c.created_at) as last_contact,
    NOW() - MAX(c.created_at) as days_since_contact
FROM leads l
LEFT JOIN calls c ON l.id = c.lead_id
WHERE l.client_key = 'stay-focused-fitness-chris'
    AND l.status NOT IN ('converted', 'do_not_call')
GROUP BY l.id, l.name, l.phone, l.status, l.created_at
HAVING MAX(c.created_at) IS NULL 
    OR NOW() - MAX(c.created_at) > INTERVAL '3 days'
ORDER BY l.created_at DESC;

-- Check integration health
SELECT 
    client_key,
    twilio_json IS NOT NULL as has_twilio,
    email_config IS NOT NULL as has_email,
    white_label IS NOT NULL as has_branding
FROM tenants;


