export async function migrateOptOutListTenantScope({ dbType, pool, sqlite, query }) {
  // Tenant-scoped DNC: opt_out_list(client_key, phone)
  // Back-compat: existing rows are assigned to client_key='__global__'
  try {
    if (dbType === 'postgres' && pool) {
      const col = await query(
        `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'opt_out_list'
          AND column_name = 'client_key'
        LIMIT 1
        `
      );
      if (!((col.rows || []).length)) {
        await query(`ALTER TABLE opt_out_list ADD COLUMN client_key TEXT`);
      }
      await query(
        `UPDATE opt_out_list SET client_key = '__global__' WHERE client_key IS NULL OR client_key = ''`
      );
      await query(`ALTER TABLE opt_out_list DROP CONSTRAINT IF EXISTS opt_out_list_phone_key`);
      await query(`ALTER TABLE opt_out_list ADD CONSTRAINT opt_out_list_client_phone_key UNIQUE (client_key, phone)`).catch(
        () => {
          /* constraint likely exists */
        }
      );
      await query(
        `CREATE INDEX IF NOT EXISTS opt_out_client_phone_active_idx ON opt_out_list(client_key, phone) WHERE active = TRUE`
      ).catch(() => {});
      return;
    }

    if (sqlite) {
      const hasTable = sqlite
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='opt_out_list'`)
        .get();
      if (!hasTable) {
        sqlite.exec(`
          CREATE TABLE IF NOT EXISTS opt_out_list (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_key TEXT NOT NULL,
            phone TEXT NOT NULL,
            reason TEXT,
            opted_out_at TEXT DEFAULT (datetime('now')),
            active INTEGER DEFAULT 1,
            updated_at TEXT DEFAULT (datetime('now')),
            notes TEXT,
            UNIQUE (client_key, phone)
          );
          CREATE INDEX IF NOT EXISTS opt_out_client_phone_active_idx
            ON opt_out_list(client_key, phone)
            WHERE active = 1;
          CREATE INDEX IF NOT EXISTS opt_out_active_idx ON opt_out_list(active);
        `);
        return;
      }

      const cols = sqlite.prepare(`PRAGMA table_info(opt_out_list)`).all();
      const hasClientKey =
        Array.isArray(cols) && cols.some((c) => String(c?.name || '') === 'client_key');
      if (hasClientKey) return;

      sqlite.exec('BEGIN');
      try {
        sqlite.exec(`
          CREATE TABLE IF NOT EXISTS opt_out_list__v2 (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_key TEXT NOT NULL,
            phone TEXT NOT NULL,
            reason TEXT,
            opted_out_at TEXT,
            active INTEGER DEFAULT 1,
            updated_at TEXT,
            notes TEXT,
            UNIQUE (client_key, phone)
          );
        `);
        sqlite.exec(`
          INSERT INTO opt_out_list__v2 (id, client_key, phone, reason, opted_out_at, active, updated_at, notes)
          SELECT
            id,
            '__global__' AS client_key,
            phone,
            reason,
            opted_out_at,
            COALESCE(active, 1) AS active,
            updated_at,
            notes
          FROM opt_out_list;
        `);
        sqlite.exec(`DROP TABLE opt_out_list;`);
        sqlite.exec(`ALTER TABLE opt_out_list__v2 RENAME TO opt_out_list;`);
        sqlite.exec(`
          CREATE INDEX IF NOT EXISTS opt_out_client_phone_active_idx
            ON opt_out_list(client_key, phone)
            WHERE active = 1;
          CREATE INDEX IF NOT EXISTS opt_out_active_idx ON opt_out_list(active);
        `);
        sqlite.exec('COMMIT');
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
    }
  } catch (e) {
    console.warn('⚠️  opt_out_list tenant-scope migration (non-fatal):', e?.message || e);
  }
}

