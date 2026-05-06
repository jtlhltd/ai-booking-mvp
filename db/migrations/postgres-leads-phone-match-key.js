export async function migratePostgresLeadsPhoneMatchKey(pgPool) {
  await pgPool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'phone_match_key'
      ) THEN
        ALTER TABLE leads ADD COLUMN phone_match_key TEXT;
        RAISE NOTICE 'Added column leads.phone_match_key';
      END IF;
    END $$;
  `);

  await pgPool.query(`
    UPDATE leads SET phone_match_key = (
      CASE
        WHEN LENGTH(regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g')) >= 10
        THEN RIGHT(regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g'), 10)
        ELSE NULLIF(regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g'), '')
      END
    )
    WHERE phone_match_key IS NULL AND phone IS NOT NULL;
  `);

  await pgPool.query(`
    UPDATE appointments a
    SET lead_id = k.keep_id
    FROM (
      SELECT client_key, phone_match_key, MIN(id) AS keep_id
      FROM leads
      WHERE phone_match_key IS NOT NULL
      GROUP BY client_key, phone_match_key
      HAVING COUNT(*) > 1
    ) k
    INNER JOIN leads ld ON ld.client_key = k.client_key
      AND ld.phone_match_key = k.phone_match_key
      AND ld.id <> k.keep_id
    WHERE a.lead_id = ld.id;
  `);

  await pgPool.query(`
    DELETE FROM leads ld
    USING (
      SELECT client_key, phone_match_key, MIN(id) AS keep_id
      FROM leads
      WHERE phone_match_key IS NOT NULL
      GROUP BY client_key, phone_match_key
    ) k
    WHERE ld.client_key = k.client_key
      AND ld.phone_match_key = k.phone_match_key
      AND ld.id <> k.keep_id;
  `);

  await pgPool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'leads_client_key_phone_unique'
      ) THEN
        ALTER TABLE leads DROP CONSTRAINT leads_client_key_phone_unique;
        RAISE NOTICE 'Dropped leads_client_key_phone_unique (superseded by phone_match_key)';
      END IF;
    END $$;
  `);

  await pgPool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS leads_client_phone_match_key_uniq
    ON leads (client_key, phone_match_key)
    WHERE phone_match_key IS NOT NULL;
  `);

  await pgPool.query(`
    CREATE INDEX IF NOT EXISTS leads_client_phone_match_key_created_desc_idx
    ON leads (client_key, phone_match_key, created_at DESC)
    WHERE phone_match_key IS NOT NULL;
  `);

  console.log('✅ leads.phone_match_key migration complete');
}

