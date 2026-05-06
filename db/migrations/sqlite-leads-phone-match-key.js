export async function migrateSqliteLeadsPhoneMatchKey({ sqlite, phoneMatchKey }) {
  if (!sqlite) return;
  try {
    sqlite.exec('ALTER TABLE leads ADD COLUMN phone_match_key TEXT');
  } catch {
    /* column may already exist */
  }
  const rows = sqlite.prepare('SELECT id, phone FROM leads').all();
  const upd = sqlite.prepare('UPDATE leads SET phone_match_key = ? WHERE id = ?');
  for (const r of rows) {
    const k = phoneMatchKey(r.phone);
    if (k) upd.run(k, r.id);
  }
  const dupGroups = sqlite
    .prepare(
      `
    SELECT client_key, phone_match_key, MIN(id) AS keep_id
    FROM leads
    WHERE phone_match_key IS NOT NULL
    GROUP BY client_key, phone_match_key
    HAVING COUNT(*) > 1
  `
    )
    .all();
  for (const g of dupGroups) {
    sqlite
      .prepare(
        `UPDATE appointments SET lead_id = ? WHERE lead_id IN (
        SELECT id FROM leads WHERE client_key = ? AND phone_match_key = ? AND id != ?
      )`
      )
      .run(g.keep_id, g.client_key, g.phone_match_key, g.keep_id);
    sqlite
      .prepare(`DELETE FROM leads WHERE client_key = ? AND phone_match_key = ? AND id != ?`)
      .run(g.client_key, g.phone_match_key, g.keep_id);
  }
  try {
    sqlite.exec(
      'CREATE UNIQUE INDEX IF NOT EXISTS leads_client_phone_match_key_uniq ON leads (client_key, phone_match_key)'
    );
  } catch (e) {
    console.warn('⚠️  SQLite phone_match_key unique index:', e.message);
  }
  console.log('✅ SQLite leads.phone_match_key migration complete');
}

