// Quick script to setup my_leads client
// Run this once: node setup-my-client.js

import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
  // No SSL config - will use default based on connection string
});

async function setup() {
  try {
    console.log('Creating my_leads client...');
    
    await pool.query(`
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
        'my_leads',
        'My Sales Leads',
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
      ON CONFLICT (client_key) DO UPDATE 
      SET vapi_json = EXCLUDED.vapi_json
    `);
    
    console.log('✅ Created my_leads client!');
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS opt_out_list (
        id SERIAL PRIMARY KEY,
        phone TEXT UNIQUE NOT NULL,
        opted_out_at TIMESTAMP DEFAULT NOW(),
        reason TEXT,
        source TEXT
      )
    `);
    
    console.log('✅ Created opt_out_list table!');
    
    const result = await pool.query(`
      SELECT 
        client_key, 
        display_name,
        vapi_json->>'assistantId' as assistant_id,
        vapi_json->>'phoneNumberId' as phone_number_id
      FROM tenants
      WHERE client_key = 'my_leads'
    `);
    
    console.log('✅ Verified:', result.rows[0]);
    console.log('\n🎉 ALL DONE! Use this URL:');
    console.log('https://ai-booking-mvp.onrender.com/lead-import.html?client=my_leads');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

setup();

