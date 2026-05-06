export async function migrateSqliteCallsLeadPhoneMatchKey({ sqlite, phoneMatchKey }) {
  if (!sqlite) return;
  try {
    sqlite.exec('ALTER TABLE calls ADD COLUMN lead_phone_match_key TEXT');
  } catch {
    /* column may already exist */
  }
  try {
    const rows = sqlite
      .prepare('SELECT id, lead_phone FROM calls WHERE lead_phone_match_key IS NULL')
      .all();
    const upd = sqlite.prepare('UPDATE calls SET lead_phone_match_key = ? WHERE id = ?');
    for (const r of rows) {
      upd.run(phoneMatchKey(r.lead_phone), r.id);
    }
  } catch (e) {
    if (!String(e.message || e).includes('no such table')) {
      console.warn('⚠️  SQLite calls.lead_phone_match_key backfill:', e.message || e);
    }
  }
  try {
    sqlite.exec(
      'CREATE INDEX IF NOT EXISTS calls_client_lead_phone_match_key_created_idx ON calls (client_key, lead_phone_match_key, created_at ASC)'
    );
  } catch {
    /* table may not exist yet */
  }
}

