// db.js (ESM) — Postgres first, SQLite fallback, and helpers expected by server/libs
import { Pool } from 'pg';
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';

const dbType = (process.env.DB_TYPE || '').toLowerCase();
let pool = null;
let sqlite = null;
let DB_PATH = 'postgres';

// ---------------------- Postgres ----------------------
async function initPostgres() {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  // Run migrations
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tenants (
      client_key TEXT PRIMARY KEY,
      display_name TEXT,
      timezone TEXT,
      locale TEXT,
      numbers_json JSONB,
      twilio_json JSONB,
      vapi_json JSONB,
      calendar_json JSONB,
      sms_templates_json JSONB,
      is_enabled BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS leads (
      id BIGSERIAL PRIMARY KEY,
      client_key TEXT NOT NULL REFERENCES tenants(client_key) ON DELETE CASCADE,
      name TEXT,
      phone TEXT NOT NULL,
      service TEXT,
      source TEXT,
      notes TEXT,
      consent_sms BOOLEAN DEFAULT TRUE,
      status TEXT DEFAULT 'new',
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS leads_tenant_idx ON leads(client_key);
    CREATE INDEX IF NOT EXISTS leads_phone_idx ON leads(client_key, phone);

    CREATE TABLE IF NOT EXISTS appointments (
      id BIGSERIAL PRIMARY KEY,
      client_key TEXT NOT NULL REFERENCES tenants(client_key) ON DELETE CASCADE,
      lead_id BIGINT REFERENCES leads(id) ON DELETE SET NULL,
      gcal_event_id TEXT,
      start_iso TIMESTAMPTZ,
      end_iso TIMESTAMPTZ,
      status TEXT DEFAULT 'booked',
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS appt_tenant_time_idx ON appointments(client_key, start_iso);

    CREATE TABLE IF NOT EXISTS messages (
      id BIGSERIAL PRIMARY KEY,
      client_key TEXT NOT NULL REFERENCES tenants(client_key) ON DELETE CASCADE,
      to_phone TEXT,
      from_phone TEXT,
      channel TEXT,
      direction TEXT,
      body TEXT,
      provider_sid TEXT,
      status TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS msg_tenant_time_idx ON messages(client_key, created_at);

    CREATE TABLE IF NOT EXISTS idempotency (
      client_key TEXT NOT NULL,
      key TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now(),
      PRIMARY KEY (client_key, key)
    );
  `);

  DB_PATH = 'postgres';
  console.log("DB: Postgres connected");
  return "postgres";
}

// ---------------------- SQLite fallback ----------------------
function initSqlite() {
  const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const sqlitePath = process.env.DB_PATH || path.join(dataDir, 'app.db');
  sqlite = new Database(sqlitePath);
  DB_PATH = sqlitePath;

  // Minimal migrations for sqlite (JSON as TEXT)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS tenants (
      client_key TEXT PRIMARY KEY,
      display_name TEXT,
      timezone TEXT,
      locale TEXT,
      numbers_json TEXT,
      twilio_json TEXT,
      vapi_json TEXT,
      calendar_json TEXT,
      sms_templates_json TEXT,
      is_enabled INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_key TEXT NOT NULL,
      name TEXT,
      phone TEXT NOT NULL,
      service TEXT,
      source TEXT,
      notes TEXT,
      consent_sms INTEGER DEFAULT 1,
      status TEXT DEFAULT 'new',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(client_key) REFERENCES tenants(client_key) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS leads_tenant_idx ON leads(client_key);
    CREATE INDEX IF NOT EXISTS leads_phone_idx ON leads(client_key, phone);
    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_key TEXT NOT NULL,
      lead_id INTEGER,
      gcal_event_id TEXT,
      start_iso TEXT,
      end_iso TEXT,
      status TEXT DEFAULT 'booked',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS appt_tenant_time_idx ON appointments(client_key, start_iso);
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_key TEXT NOT NULL,
      to_phone TEXT,
      from_phone TEXT,
      channel TEXT,
      direction TEXT,
      body TEXT,
      provider_sid TEXT,
      status TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS msg_tenant_time_idx ON messages(client_key, created_at);
    CREATE TABLE IF NOT EXISTS idempotency (
      client_key TEXT NOT NULL,
      key TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (client_key, key)
    );
  `);

  console.log(\`DB: SQLite at \${sqlitePath}\`);
  return \`sqlite:\${sqlitePath}\`;
}

// ---------------------- Core API ----------------------
export async function init() {
  if (dbType === 'postgres' && process.env.DATABASE_URL) {
    return await initPostgres();
  } else {
    return initSqlite();
  }
}

export async function query(text, params = []) {
  if (pool) return pool.query(text, params);
  if (sqlite) {
    // very simple param replacement for '?', map $1 style to '?'
    const q = text.replace(/\$\d+/g, '?');
    const stmt = sqlite.prepare(q);
    // Decide run vs all based on statement type
    if (/^\s*select/i.test(text)) {
      const rows = stmt.all(...params);
      return { rows };
    } else {
      const info = stmt.run(...params);
      return { rows: [], rowCount: info.changes, lastID: info.lastInsertRowid };
    }
  }
  throw new Error("DB not initialized");
}

export { DB_PATH };

// ---------------------- Helpers used by server/libs ----------------------
function toJson(val) {
  if (val == null) return null;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return null; }
}

function mapTenantRow(r) {
  if (!r) return null;
  const numbers = toJson(r.numbers_json) || {};
  const sms = toJson(r.twilio_json) || {};
  const vapi = toJson(r.vapi_json) || {};
  const calendar = toJson(r.calendar_json) || {};
  const smsTemplates = toJson(r.sms_templates_json) || {};

  const out = {
    clientKey: r.client_key,
    displayName: r.display_name,
    timezone: r.timezone,
    locale: r.locale,
    numbers,
    sms,
    vapi,
    calendarId: calendar.calendarId || calendar.calendar_id || null,
    booking: calendar.booking || { defaultDurationMin: 30, timezone: r.timezone },
    smsTemplates,
    isEnabled: r.is_enabled === true || r.is_enabled === 1,
    createdAt: r.created_at
  };
  // Convenience top-level fields many routes expect:
  out.vapiAssistantId = vapi.assistantId || null;
  out.vapiPhoneNumberId = vapi.phoneNumberId || null;
  // serviceMap shape expected by slots.js
  out.serviceMap = (calendar.services) || {};
  return out;
}

export async function listFullClients() {
  const { rows } = await query(`
    SELECT client_key, display_name, timezone, locale,
           numbers_json, twilio_json, vapi_json, calendar_json, sms_templates_json, is_enabled, created_at
    FROM tenants ORDER BY created_at DESC
  `);
  return rows.map(mapTenantRow);
}

export async function getFullClient(clientKey) {
  const { rows } = await query(`
    SELECT client_key, display_name, timezone, locale,
           numbers_json, twilio_json, vapi_json, calendar_json, sms_templates_json, is_enabled, created_at
    FROM tenants WHERE client_key = $1
  `, [clientKey]);
  return mapTenantRow(rows[0]);
}

export async function upsertFullClient(c) {
  const numbers_json = c.numbers ? JSON.stringify(c.numbers) : null;
  const twilio_json = c.sms ? JSON.stringify(c.sms) : null;
  const vapi = c.vapi || {};
  if (c.vapiAssistantId) vapi.assistantId = c.vapiAssistantId;
  if (c.vapiPhoneNumberId) vapi.phoneNumberId = c.vapiPhoneNumberId;
  const vapi_json = Object.keys(vapi).length ? JSON.stringify(vapi) : null;
  const calendar = {
    calendarId: c.calendarId || c.gcalCalendarId || null,
    services: Array.isArray(c.services) ? c.services.reduce((acc, s) => { acc[s.id] = s; return acc; }, {}) : (c.serviceMap || {}),
    booking: c.booking || { defaultDurationMin: c.bookingDefaultDurationMin || 30, timezone: c.timezone || c.booking?.timezone }
  };
  const calendar_json = JSON.stringify(calendar);
  const sms_templates_json = c.smsTemplates ? JSON.stringify(c.smsTemplates) : null;

  const args = [
    c.clientKey, c.displayName || c.clientKey, c.booking?.timezone || c.timezone || null, c.locale || 'en-GB',
    numbers_json, twilio_json, vapi_json, calendar_json, sms_templates_json
  ];

  if (pool) {
    await query(`
      INSERT INTO tenants (client_key, display_name, timezone, locale, numbers_json, twilio_json, vapi_json, calendar_json, sms_templates_json)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (client_key) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        timezone = EXCLUDED.timezone,
        locale = EXCLUDED.locale,
        numbers_json = EXCLUDED.numbers_json,
        twilio_json = EXCLUDED.twilio_json,
        vapi_json = EXCLUDED.vapi_json,
        calendar_json = EXCLUDED.calendar_json,
        sms_templates_json = EXCLUDED.sms_templates_json
    `, args);
  } else {
    // sqlite: upsert via replace
    const row = sqlite.prepare(\`SELECT client_key FROM tenants WHERE client_key=?\`).get(c.clientKey);
    if (row) {
      sqlite.prepare(\`UPDATE tenants SET display_name=?, timezone=?, locale=?, numbers_json=?, twilio_json=?, vapi_json=?, calendar_json=?, sms_templates_json=? WHERE client_key=?\`)
        .run(args[1], args[2], args[3], args[4], args[5], args[6], args[7], args[8], args[0]);
    } else {
      sqlite.prepare(\`INSERT INTO tenants (client_key, display_name, timezone, locale, numbers_json, twilio_json, vapi_json, calendar_json, sms_templates_json)
                      VALUES (?,?,?,?,?,?,?,?,?)\`).run(...args);
    }
  }
  return true;
}

export async function deleteClient(clientKey) {
  return await query(\`DELETE FROM tenants WHERE client_key = $1\`, [clientKey]);
}

// Extra helpers some libs call
export async function findOrCreateLead({ tenantKey, phone, name = null, service = null, source = null }) {
  let out = await query(
    \`SELECT * FROM leads WHERE client_key=$1 AND phone=$2 ORDER BY created_at DESC LIMIT 1\`,
    [tenantKey, phone]
  );
  if (out.rows && out.rows.length) return out.rows[0];
  out = await query(
    \`INSERT INTO leads (client_key, name, phone, service, source) VALUES ($1,$2,$3,$4,$5) RETURNING *\`,
    [tenantKey, name, phone, service, source]
  );
  if (out.rows) return out.rows[0];
  // sqlite fallback
  const row = sqlite.prepare(\`SELECT last_insert_rowid() as id\`).get();
  return { id: row?.id, client_key: tenantKey, name, phone, service, source };
}

export async function setSmsConsent(tenantKey, phone, consent) {
  await query(\`UPDATE leads SET consent_sms=$3 WHERE client_key=$1 AND phone=$2\`, [tenantKey, phone, !!consent]);
}

export async function storeProposedChoice({ tenantKey, phone, choice }) {
  await query(
    \`INSERT INTO messages (client_key, to_phone, from_phone, channel, direction, body, status)
     VALUES ($1,$2,$3,'sms','inbound',$4,'noted')\`,
    [tenantKey, phone, null, 'CHOICE:' + JSON.stringify(choice)]
  );
}

export async function markBooked({ tenantKey, leadId = null, eventId, slot }) {
  await query(
    \`INSERT INTO appointments (client_key, lead_id, gcal_event_id, start_iso, end_iso, status)
     VALUES ($1,$2,$3,$4,$5,'booked')\`,
    [tenantKey, leadId, eventId, slot.start, slot.end]
  );
}
