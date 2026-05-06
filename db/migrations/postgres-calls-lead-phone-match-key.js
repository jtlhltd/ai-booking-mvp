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

  console.log('✅ calls.lead_phone_match_key migration complete');
}

