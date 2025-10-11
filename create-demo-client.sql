-- Create demo_client tenant with correct Vapi credentials
-- Run this in Render PostgreSQL: https://dashboard.render.com/d/dpg-d36t1smmcj7s73dvdcqg-a

INSERT INTO tenants (
  client_key,
  display_name,
  is_enabled,
  locale,
  timezone,
  calendar_json,
  twilio_json,
  vapi_json,
  numbers_json,
  sms_templates_json,
  created_at
) VALUES (
  'demo_client',
  'Demo Client',
  true,
  'en-GB',
  'Europe/London',
  '{"calendarId": null, "timezone": "Europe/London", "services": {}, "booking": {"defaultDurationMin": 30}}'::jsonb,
  '{}'::jsonb,
  '{
    "assistantId": "dd67a51c-7485-4b62-930a-4a84f328a1c9",
    "phoneNumberId": "934ecfdb-fe7b-4d53-81c0-7908b97036b5",
    "maxDurationSeconds": 300
  }'::jsonb,
  '{}'::jsonb,
  '{}'::jsonb,
  NOW()
)
ON CONFLICT (client_key) 
DO UPDATE SET 
  vapi_json = '{
    "assistantId": "dd67a51c-7485-4b62-930a-4a84f328a1c9",
    "phoneNumberId": "934ecfdb-fe7b-4d53-81c0-7908b97036b5",
    "maxDurationSeconds": 300
  }'::jsonb,
  display_name = 'Demo Client',
  is_enabled = true;

-- Also create opt_out_list table if it doesn't exist (fixes the other error)
CREATE TABLE IF NOT EXISTS opt_out_list (
  id SERIAL PRIMARY KEY,
  phone TEXT UNIQUE NOT NULL,
  opted_out_at TIMESTAMP DEFAULT NOW(),
  reason TEXT,
  source TEXT
);

-- Verify the tenant was created/updated correctly
SELECT 
  client_key, 
  display_name, 
  is_enabled,
  vapi_json->>'assistantId' as assistant_id,
  vapi_json->>'phoneNumberId' as phone_number_id
FROM tenants 
WHERE client_key = 'demo_client';

