/**
 * Demo/setup routes: check-db, clear-my-leads, setup-my-client.
 * For local/debug and quick my_leads client setup.
 */
import express from 'express';
import { query } from '../db.js';

const router = express.Router();

const noCache = (req, res, next) => {
  res.set({
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  next();
};

router.get('/check-db', noCache, async (req, res) => {
  try {
    console.log('[CHECK] Checking database...');
    const tenants = await query(`SELECT client_key, display_name, vapi_json FROM tenants ORDER BY client_key`);
    console.log('[CHECK] Found tenants:', tenants.rows);
    res.json({ success: true, tenants: tenants.rows });
  } catch (error) {
    console.error('[CHECK] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/clear-my-leads', noCache, async (req, res) => {
  try {
    console.log('[CLEAR] Clearing leads for my_leads...');
    const result = await query(`DELETE FROM leads WHERE client_key = 'my_leads'`);
    console.log('[CLEAR] ✅ Cleared', result.rowCount, 'leads for my_leads');
    res.json({
      success: true,
      message: `✅ Cleared ${result.rowCount} leads for my_leads`,
      cleared: result.rowCount
    });
  } catch (error) {
    console.error('[CLEAR] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/setup-my-client', noCache, async (req, res) => {
  try {
    console.log('[SETUP] Starting setup-my-client endpoint...');
    await query(`DELETE FROM tenants WHERE client_key = 'my_leads'`);
    console.log('[SETUP] Creating my_leads client...');
    await query(`
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
    `);
    console.log('[SETUP] ✅ my_leads client created fresh');

    await query(`
      CREATE TABLE IF NOT EXISTS opt_out_list (
        id BIGSERIAL PRIMARY KEY,
        phone TEXT NOT NULL UNIQUE,
        reason TEXT,
        opted_out_at TIMESTAMPTZ DEFAULT NOW(),
        active BOOLEAN DEFAULT TRUE,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        notes TEXT
      )
    `);

    try {
      const checkActive = await query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'opt_out_list' AND column_name = 'active'`);
      if (checkActive.rows.length === 0) {
        await query(`ALTER TABLE opt_out_list ADD COLUMN active BOOLEAN DEFAULT TRUE`);
        console.log('[SETUP] Added active column');
      }
      const checkUpdated = await query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'opt_out_list' AND column_name = 'updated_at'`);
      if (checkUpdated.rows.length === 0) {
        await query(`ALTER TABLE opt_out_list ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW()`);
        console.log('[SETUP] Added updated_at column');
      }
      const checkNotes = await query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'opt_out_list' AND column_name = 'notes'`);
      if (checkNotes.rows.length === 0) {
        await query(`ALTER TABLE opt_out_list ADD COLUMN notes TEXT`);
        console.log('[SETUP] Added notes column');
      }
    } catch (err) {
      console.log('[SETUP] Column migration error:', err.message);
    }

    await query(`CREATE INDEX IF NOT EXISTS opt_out_phone_idx ON opt_out_list(phone) WHERE active = TRUE`);
    await query(`CREATE INDEX IF NOT EXISTS opt_out_active_idx ON opt_out_list(active)`);

    const result = await query(`
      SELECT 
        client_key, 
        display_name,
        vapi_json->>'assistantId' as assistant_id,
        vapi_json->>'phoneNumberId' as phone_number_id
      FROM tenants
      WHERE client_key = 'my_leads'
    `);
    console.log('[SETUP] ✅ Setup complete! Client:', result.rows[0]);
    res.json({
      success: true,
      message: '✅ Setup complete!',
      client: result.rows[0],
      importUrl: `${req.protocol}://${req.get('host')}/lead-import.html?client=my_leads`
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
