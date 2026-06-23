export async function migratePostgresCallsLeadPhoneMatchKey(pgPool) {
  await pgPool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'calls' AND column_name = 'lead_phone_match_key'
      ) THEN
        ALTER TABLE calls ADD COLUMN lead_phone_match_key TEXT;
        RAISE NOTICE 'Added column calls.lead_phone_match_key';
      END IF;
    END $$;
  `);

  await pgPool.query(`
    UPDATE calls SET lead_phone_match_key = (
      CASE
        WHEN LENGTH(regexp_replace(COALESCE(lead_phone, ''), '[^0-9]', '', 'g')) >= 10
        THEN RIGHT(regexp_replace(COALESCE(lead_phone, ''), '[^0-9]', '', 'g'), 10)
        ELSE NULLIF(regexp_replace(COALESCE(lead_phone, ''), '[^0-9]', '', 'g'), '')
      END
    )
    WHERE lead_phone_match_key IS NULL AND lead_phone IS NOT NULL;
  `);

  await pgPool.query(`
    CREATE INDEX IF NOT EXISTS calls_client_lead_phone_match_key_created_idx
    ON calls (client_key, lead_phone_match_key, created_at ASC)
    WHERE lead_phone_match_key IS NOT NULL;
  `);

  // failed_q catch-up: avoid 100s+ scans from regexp-based NOT EXISTS (see server-queue-workers.js)
  await pgPool.query(`
    CREATE INDEX IF NOT EXISTS calls_failed_q_client_dial_match_key_created_desc_idx
    ON calls (client_key, COALESCE(lead_phone_match_key, '__nodigits__'), created_at DESC)
    WHERE call_id LIKE 'failed_q%';
  `);
  await pgPool.query(`
    CREATE INDEX IF NOT EXISTS calls_client_dial_match_key_success_created_desc_idx
    ON calls (client_key, COALESCE(lead_phone_match_key, '__nodigits__'), created_at DESC)
    WHERE call_id NOT LIKE 'failed_q%';
  `);
  await pgPool.query(`
    CREATE INDEX IF NOT EXISTS calls_failed_q_created_client_idx
    ON calls (created_at DESC, client_key)
    WHERE call_id LIKE 'failed_q%';
  `);

  console.log('✅ calls.lead_phone_match_key migration complete');
}

