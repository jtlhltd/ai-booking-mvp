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

    CREATE TABLE IF NOT EXISTS calls (
      id BIGSERIAL PRIMARY KEY,
      call_id TEXT UNIQUE NOT NULL,
      client_key TEXT NOT NULL REFERENCES tenants(client_key) ON DELETE CASCADE,
      lead_phone TEXT NOT NULL,
      status TEXT NOT NULL,
      outcome TEXT,
      duration INTEGER,
      cost DECIMAL(10,4),
      metadata JSONB,
      retry_attempt INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS calls_tenant_idx ON calls(client_key);
    CREATE INDEX IF NOT EXISTS calls_phone_idx ON calls(client_key, lead_phone);
    CREATE INDEX IF NOT EXISTS calls_status_idx ON calls(status);
    CREATE INDEX IF NOT EXISTS calls_outcome_idx ON calls(outcome);
    CREATE INDEX IF NOT EXISTS calls_created_idx ON calls(created_at);

    CREATE TABLE IF NOT EXISTS retry_queue (
      id BIGSERIAL PRIMARY KEY,
      client_key TEXT NOT NULL REFERENCES tenants(client_key) ON DELETE CASCADE,
      lead_phone TEXT NOT NULL,
      retry_type TEXT NOT NULL,
      retry_reason TEXT,
      retry_data JSONB,
      scheduled_for TIMESTAMPTZ NOT NULL,
      retry_attempt INTEGER DEFAULT 1,
      max_retries INTEGER DEFAULT 3,
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS retry_queue_tenant_idx ON retry_queue(client_key);
    CREATE INDEX IF NOT EXISTS retry_queue_scheduled_idx ON retry_queue(scheduled_for);
    CREATE INDEX IF NOT EXISTS retry_queue_status_idx ON retry_queue(status);
    CREATE INDEX IF NOT EXISTS retry_queue_phone_idx ON retry_queue(client_key, lead_phone);

    CREATE TABLE IF NOT EXISTS call_queue (
      id BIGSERIAL PRIMARY KEY,
      client_key TEXT NOT NULL REFERENCES tenants(client_key) ON DELETE CASCADE,
      lead_phone TEXT NOT NULL,
      priority INTEGER DEFAULT 5,
      scheduled_for TIMESTAMPTZ NOT NULL,
      call_type TEXT NOT NULL,
      call_data JSONB,
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS call_queue_tenant_idx ON call_queue(client_key);
    CREATE INDEX IF NOT EXISTS call_queue_scheduled_idx ON call_queue(scheduled_for);
    CREATE INDEX IF NOT EXISTS call_queue_status_idx ON call_queue(status);
    CREATE INDEX IF NOT EXISTS call_queue_priority_idx ON call_queue(priority);
    CREATE INDEX IF NOT EXISTS call_queue_phone_idx ON call_queue(client_key, lead_phone);

    CREATE TABLE IF NOT EXISTS cost_tracking (
      id BIGSERIAL PRIMARY KEY,
      client_key TEXT NOT NULL REFERENCES tenants(client_key) ON DELETE CASCADE,
      call_id TEXT,
      cost_type TEXT NOT NULL,
      amount DECIMAL(10,4) NOT NULL,
      currency TEXT DEFAULT 'USD',
      description TEXT,
      metadata JSONB,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS cost_tracking_tenant_idx ON cost_tracking(client_key);
    CREATE INDEX IF NOT EXISTS cost_tracking_type_idx ON cost_tracking(cost_type);
    CREATE INDEX IF NOT EXISTS cost_tracking_created_idx ON cost_tracking(created_at);

    CREATE TABLE IF NOT EXISTS budget_limits (
      id BIGSERIAL PRIMARY KEY,
      client_key TEXT NOT NULL REFERENCES tenants(client_key) ON DELETE CASCADE,
      budget_type TEXT NOT NULL,
      daily_limit DECIMAL(10,4),
      weekly_limit DECIMAL(10,4),
      monthly_limit DECIMAL(10,4),
      currency TEXT DEFAULT 'USD',
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS budget_limits_tenant_idx ON budget_limits(client_key);
    CREATE INDEX IF NOT EXISTS budget_limits_type_idx ON budget_limits(budget_type);

    CREATE TABLE IF NOT EXISTS cost_alerts (
      id BIGSERIAL PRIMARY KEY,
      client_key TEXT NOT NULL REFERENCES tenants(client_key) ON DELETE CASCADE,
      alert_type TEXT NOT NULL,
      threshold DECIMAL(10,4) NOT NULL,
      current_amount DECIMAL(10,4) NOT NULL,
      period TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      triggered_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS cost_alerts_tenant_idx ON cost_alerts(client_key);
    CREATE INDEX IF NOT EXISTS cost_alerts_status_idx ON cost_alerts(status);

    CREATE TABLE IF NOT EXISTS analytics_events (
      id BIGSERIAL PRIMARY KEY,
      client_key TEXT NOT NULL REFERENCES tenants(client_key) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      event_category TEXT NOT NULL,
      event_data JSONB,
      session_id TEXT,
      user_agent TEXT,
      ip_address INET,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS analytics_events_tenant_idx ON analytics_events(client_key);
    CREATE INDEX IF NOT EXISTS analytics_events_type_idx ON analytics_events(event_type);
    CREATE INDEX IF NOT EXISTS analytics_events_category_idx ON analytics_events(event_category);
    CREATE INDEX IF NOT EXISTS analytics_events_created_idx ON analytics_events(created_at);
    CREATE INDEX IF NOT EXISTS analytics_events_session_idx ON analytics_events(session_id);

    CREATE TABLE IF NOT EXISTS conversion_funnel (
      id BIGSERIAL PRIMARY KEY,
      client_key TEXT NOT NULL REFERENCES tenants(client_key) ON DELETE CASCADE,
      lead_phone TEXT NOT NULL,
      stage TEXT NOT NULL,
      stage_data JSONB,
      previous_stage TEXT,
      time_to_stage INTEGER,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS conversion_funnel_tenant_idx ON conversion_funnel(client_key);
    CREATE INDEX IF NOT EXISTS conversion_funnel_phone_idx ON conversion_funnel(client_key, lead_phone);
    CREATE INDEX IF NOT EXISTS conversion_funnel_stage_idx ON conversion_funnel(stage);
    CREATE INDEX IF NOT EXISTS conversion_funnel_created_idx ON conversion_funnel(created_at);

    CREATE TABLE IF NOT EXISTS performance_metrics (
      id BIGSERIAL PRIMARY KEY,
      client_key TEXT NOT NULL REFERENCES tenants(client_key) ON DELETE CASCADE,
      metric_name TEXT NOT NULL,
      metric_value DECIMAL(15,6) NOT NULL,
      metric_unit TEXT,
      metric_category TEXT,
      metadata JSONB,
      recorded_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS performance_metrics_tenant_idx ON performance_metrics(client_key);
    CREATE INDEX IF NOT EXISTS performance_metrics_name_idx ON performance_metrics(metric_name);
    CREATE INDEX IF NOT EXISTS performance_metrics_category_idx ON performance_metrics(metric_category);
    CREATE INDEX IF NOT EXISTS performance_metrics_recorded_idx ON performance_metrics(recorded_at);

    CREATE TABLE IF NOT EXISTS ab_test_experiments (
      id BIGSERIAL PRIMARY KEY,
      client_key TEXT NOT NULL REFERENCES tenants(client_key) ON DELETE CASCADE,
      experiment_name TEXT NOT NULL,
      variant_name TEXT NOT NULL,
      variant_config JSONB,
      is_active BOOLEAN DEFAULT TRUE,
      start_date TIMESTAMPTZ DEFAULT now(),
      end_date TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS ab_test_tenant_idx ON ab_test_experiments(client_key);
    CREATE INDEX IF NOT EXISTS ab_test_name_idx ON ab_test_experiments(experiment_name);
    CREATE INDEX IF NOT EXISTS ab_test_active_idx ON ab_test_experiments(is_active);

    CREATE TABLE IF NOT EXISTS ab_test_results (
      id BIGSERIAL PRIMARY KEY,
      experiment_id BIGINT REFERENCES ab_test_experiments(id) ON DELETE CASCADE,
      client_key TEXT NOT NULL REFERENCES tenants(client_key) ON DELETE CASCADE,
      lead_phone TEXT NOT NULL,
      variant_name TEXT NOT NULL,
      outcome TEXT,
      outcome_data JSONB,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS ab_test_results_experiment_idx ON ab_test_results(experiment_id);
    CREATE INDEX IF NOT EXISTS ab_test_results_tenant_idx ON ab_test_results(client_key);
    CREATE INDEX IF NOT EXISTS ab_test_results_phone_idx ON ab_test_results(client_key, lead_phone);
    CREATE INDEX IF NOT EXISTS ab_test_results_outcome_idx ON ab_test_results(outcome);

    CREATE TABLE IF NOT EXISTS idempotency (
      client_key TEXT NOT NULL,
      key TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now(),
      PRIMARY KEY (client_key, key)
    );
  `);

  DB_PATH = 'postgres';
  console.log('DB: Postgres connected');
  return 'postgres';
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

  // avoid template literal parsing issues
  console.log('DB: SQLite at ' + sqlitePath);
  return 'sqlite:' + sqlitePath;
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
    const q = text.replace(/\$\d+/g, '?');  // $1 -> ?
    const stmt = sqlite.prepare(q);
    if (/^\s*select/i.test(text)) {
      const rows = stmt.all(...params);
      return { rows };
    } else {
      const info = stmt.run(...params);
      return { rows: [], rowCount: info.changes, lastID: info.lastInsertRowid };
    }
  }
  throw new Error('DB not initialized');
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
  out.vapiAssistantId = vapi.assistantId || null;
  out.vapiPhoneNumberId = vapi.phoneNumberId || null;
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
    const row = sqlite.prepare('SELECT client_key FROM tenants WHERE client_key=?').get(c.clientKey);
    if (row) {
      sqlite.prepare('UPDATE tenants SET display_name=?, timezone=?, locale=?, numbers_json=?, twilio_json=?, vapi_json=?, calendar_json=?, sms_templates_json=? WHERE client_key=?')
        .run(args[1], args[2], args[3], args[4], args[5], args[6], args[7], args[8], args[0]);
    } else {
      sqlite.prepare('INSERT INTO tenants (client_key, display_name, timezone, locale, numbers_json, twilio_json, vapi_json, calendar_json, sms_templates_json) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(...args);
    }
  }
  return true;
}

export async function deleteClient(clientKey) {
  return await query('DELETE FROM tenants WHERE client_key = $1', [clientKey]);
}

// Extra helpers some libs call
export async function findOrCreateLead({ tenantKey, phone, name = null, service = null, source = null }) {
  let out = await query(
    'SELECT * FROM leads WHERE client_key=$1 AND phone=$2 ORDER BY created_at DESC LIMIT 1',
    [tenantKey, phone]
  );
  if (out.rows && out.rows.length) return out.rows[0];
  out = await query(
    'INSERT INTO leads (client_key, name, phone, service, source) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [tenantKey, name, phone, service, source]
  );
  if (out.rows) return out.rows[0];
  const row = sqlite.prepare('SELECT last_insert_rowid() as id').get();
  return { id: row?.id, client_key: tenantKey, name, phone, service, source };
}

export async function setSmsConsent(tenantKey, phone, consent) {
  await query('UPDATE leads SET consent_sms=$3 WHERE client_key=$1 AND phone=$2', [tenantKey, phone, !!consent]);
}

export async function storeProposedChoice({ tenantKey, phone, choice }) {
  await query(
    'INSERT INTO messages (client_key, to_phone, from_phone, channel, direction, body, status) VALUES ($1,$2,$3,\'sms\',\'inbound\',$4,\'noted\')',
    [tenantKey, phone, null, 'CHOICE:' + JSON.stringify(choice)]
  );
}

export async function markBooked({ tenantKey, leadId = null, eventId, slot }) {
  await query(
    'INSERT INTO appointments (client_key, lead_id, gcal_event_id, start_iso, end_iso, status) VALUES ($1,$2,$3,$4,$5,\'booked\')',
    [tenantKey, leadId, eventId, slot.start, slot.end]
  );
}

// Call tracking functions
export async function upsertCall({ callId, clientKey, leadPhone, status, outcome, duration, cost, metadata, retryAttempt = 0 }) {
  const metadataJson = metadata ? JSON.stringify(metadata) : null;
  
  await query(`
    INSERT INTO calls (call_id, client_key, lead_phone, status, outcome, duration, cost, metadata, retry_attempt, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
    ON CONFLICT (call_id) 
    DO UPDATE SET 
      status = EXCLUDED.status,
      outcome = EXCLUDED.outcome,
      duration = EXCLUDED.duration,
      cost = EXCLUDED.cost,
      metadata = EXCLUDED.metadata,
      retry_attempt = EXCLUDED.retry_attempt,
      updated_at = now()
  `, [callId, clientKey, leadPhone, status, outcome, duration, cost, metadataJson, retryAttempt]);
}

export async function getCallsByTenant(clientKey, limit = 100) {
  const { rows } = await query(`
    SELECT * FROM calls 
    WHERE client_key = $1 
    ORDER BY created_at DESC 
    LIMIT $2
  `, [clientKey, limit]);
  return rows;
}

export async function getCallsByPhone(clientKey, leadPhone, limit = 50) {
  const { rows } = await query(`
    SELECT * FROM calls 
    WHERE client_key = $1 AND lead_phone = $2 
    ORDER BY created_at DESC 
    LIMIT $3
  `, [clientKey, leadPhone, limit]);
  return rows;
}

export async function getRecentCallsCount(clientKey, minutesBack = 60) {
  const { rows } = await query(`
    SELECT COUNT(*) as count FROM calls 
    WHERE client_key = $1 AND created_at > now() - interval '${minutesBack} minutes'
  `, [clientKey]);
  return parseInt(rows[0]?.count || 0);
}

// Retry queue functions
export async function addToRetryQueue({ clientKey, leadPhone, retryType, retryReason, retryData, scheduledFor, retryAttempt = 1, maxRetries = 3 }) {
  const retryDataJson = retryData ? JSON.stringify(retryData) : null;
  
  const { rows } = await query(`
    INSERT INTO retry_queue (client_key, lead_phone, retry_type, retry_reason, retry_data, scheduled_for, retry_attempt, max_retries, status)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
    RETURNING *
  `, [clientKey, leadPhone, retryType, retryReason, retryDataJson, scheduledFor, retryAttempt, maxRetries]);
  
  return rows[0];
}

export async function getPendingRetries(limit = 100) {
  const { rows } = await query(`
    SELECT * FROM retry_queue 
    WHERE status = 'pending' AND scheduled_for <= now()
    ORDER BY scheduled_for ASC
    LIMIT $1
  `, [limit]);
  return rows;
}

export async function updateRetryStatus(id, status, retryAttempt = null) {
  const updates = ['status = $2', 'updated_at = now()'];
  const params = [id, status];
  
  if (retryAttempt !== null) {
    updates.push('retry_attempt = $3');
    params.push(retryAttempt);
  }
  
  await query(`
    UPDATE retry_queue 
    SET ${updates.join(', ')}
    WHERE id = $1
  `, params);
}

export async function getRetriesByPhone(clientKey, leadPhone, limit = 50) {
  const { rows } = await query(`
    SELECT * FROM retry_queue 
    WHERE client_key = $1 AND lead_phone = $2 
    ORDER BY created_at DESC 
    LIMIT $3
  `, [clientKey, leadPhone, limit]);
  return rows;
}

export async function cleanupOldRetries(daysOld = 7) {
  await query(`
    DELETE FROM retry_queue 
    WHERE created_at < now() - interval '${daysOld} days'
    AND status IN ('completed', 'failed', 'cancelled')
  `);
}

// Call queue functions
export async function addToCallQueue({ clientKey, leadPhone, priority = 5, scheduledFor, callType, callData }) {
  const callDataJson = callData ? JSON.stringify(callData) : null;
  
  const { rows } = await query(`
    INSERT INTO call_queue (client_key, lead_phone, priority, scheduled_for, call_type, call_data, status)
    VALUES ($1, $2, $3, $4, $5, $6, 'pending')
    RETURNING *
  `, [clientKey, leadPhone, priority, scheduledFor, callType, callDataJson]);
  
  return rows[0];
}

export async function getPendingCalls(limit = 100) {
  const { rows } = await query(`
    SELECT * FROM call_queue 
    WHERE status = 'pending' AND scheduled_for <= now()
    ORDER BY priority ASC, scheduled_for ASC
    LIMIT $1
  `, [limit]);
  return rows;
}

export async function updateCallQueueStatus(id, status) {
  await query(`
    UPDATE call_queue 
    SET status = $2, updated_at = now()
    WHERE id = $1
  `, [id, status]);
}

export async function getCallQueueByTenant(clientKey, limit = 100) {
  const { rows } = await query(`
    SELECT * FROM call_queue 
    WHERE client_key = $1 
    ORDER BY scheduled_for ASC
    LIMIT $2
  `, [clientKey, limit]);
  return rows;
}

export async function getCallQueueByPhone(clientKey, leadPhone, limit = 50) {
  const { rows } = await query(`
    SELECT * FROM call_queue 
    WHERE client_key = $1 AND lead_phone = $2 
    ORDER BY scheduled_for ASC
    LIMIT $3
  `, [clientKey, leadPhone, limit]);
  return rows;
}

export async function cleanupOldCallQueue(daysOld = 7) {
  await query(`
    DELETE FROM call_queue 
    WHERE created_at < now() - interval '${daysOld} days'
    AND status IN ('completed', 'failed', 'cancelled')
  `);
}

// Cost tracking functions
export async function trackCost({ clientKey, callId, costType, amount, currency = 'USD', description, metadata }) {
  const metadataJson = metadata ? JSON.stringify(metadata) : null;
  
  const { rows } = await query(`
    INSERT INTO cost_tracking (client_key, call_id, cost_type, amount, currency, description, metadata)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `, [clientKey, callId, costType, amount, currency, description, metadataJson]);
  
  return rows[0];
}

export async function getCostsByTenant(clientKey, limit = 100) {
  const { rows } = await query(`
    SELECT * FROM cost_tracking 
    WHERE client_key = $1 
    ORDER BY created_at DESC 
    LIMIT $2
  `, [clientKey, limit]);
  return rows;
}

export async function getCostsByPeriod(clientKey, period = 'daily') {
  let interval;
  switch (period) {
    case 'daily': interval = '1 day'; break;
    case 'weekly': interval = '7 days'; break;
    case 'monthly': interval = '30 days'; break;
    default: interval = '1 day';
  }
  
  const { rows } = await query(`
    SELECT 
      cost_type,
      SUM(amount) as total_amount,
      COUNT(*) as transaction_count,
      AVG(amount) as avg_amount
    FROM cost_tracking 
    WHERE client_key = $1 
    AND created_at > now() - interval '${interval}'
    GROUP BY cost_type
    ORDER BY total_amount DESC
  `, [clientKey]);
  return rows;
}

export async function getTotalCostsByTenant(clientKey, period = 'daily') {
  let interval;
  switch (period) {
    case 'daily': interval = '1 day'; break;
    case 'weekly': interval = '7 days'; break;
    case 'monthly': interval = '30 days'; break;
    default: interval = '1 day';
  }
  
  const { rows } = await query(`
    SELECT 
      SUM(amount) as total_cost,
      COUNT(*) as transaction_count,
      AVG(amount) as avg_cost
    FROM cost_tracking 
    WHERE client_key = $1 
    AND created_at > now() - interval '${interval}'
  `, [clientKey]);
  return rows[0];
}

// Budget management functions
export async function setBudgetLimit({ clientKey, budgetType, dailyLimit, weeklyLimit, monthlyLimit, currency = 'USD' }) {
  const { rows } = await query(`
    INSERT INTO budget_limits (client_key, budget_type, daily_limit, weekly_limit, monthly_limit, currency)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (client_key, budget_type) 
    DO UPDATE SET 
      daily_limit = EXCLUDED.daily_limit,
      weekly_limit = EXCLUDED.weekly_limit,
      monthly_limit = EXCLUDED.monthly_limit,
      currency = EXCLUDED.currency,
      updated_at = now()
    RETURNING *
  `, [clientKey, budgetType, dailyLimit, weeklyLimit, monthlyLimit, currency]);
  
  return rows[0];
}

export async function getBudgetLimits(clientKey) {
  const { rows } = await query(`
    SELECT * FROM budget_limits 
    WHERE client_key = $1 AND is_active = TRUE
    ORDER BY budget_type
  `, [clientKey]);
  return rows;
}

export async function checkBudgetExceeded(clientKey, budgetType, period = 'daily') {
  const budgetLimits = await getBudgetLimits(clientKey);
  const budget = budgetLimits.find(b => b.budget_type === budgetType);
  
  if (!budget) return { exceeded: false, limit: 0, current: 0 };
  
  const currentCosts = await getTotalCostsByTenant(clientKey, period);
  const currentAmount = parseFloat(currentCosts.total_cost || 0);
  
  let limit;
  switch (period) {
    case 'daily': limit = parseFloat(budget.daily_limit || 0); break;
    case 'weekly': limit = parseFloat(budget.weekly_limit || 0); break;
    case 'monthly': limit = parseFloat(budget.monthly_limit || 0); break;
    default: limit = parseFloat(budget.daily_limit || 0);
  }
  
  return {
    exceeded: currentAmount > limit,
    limit,
    current: currentAmount,
    remaining: Math.max(0, limit - currentAmount),
    percentage: limit > 0 ? (currentAmount / limit) * 100 : 0
  };
}

// Cost alert functions
export async function createCostAlert({ clientKey, alertType, threshold, currentAmount, period }) {
  const { rows } = await query(`
    INSERT INTO cost_alerts (client_key, alert_type, threshold, current_amount, period, status)
    VALUES ($1, $2, $3, $4, $5, 'active')
    RETURNING *
  `, [clientKey, alertType, threshold, currentAmount, period]);
  
  return rows[0];
}

export async function getActiveAlerts(clientKey) {
  const { rows } = await query(`
    SELECT * FROM cost_alerts 
    WHERE client_key = $1 AND status = 'active'
    ORDER BY created_at DESC
  `, [clientKey]);
  return rows;
}

export async function triggerAlert(alertId) {
  await query(`
    UPDATE cost_alerts 
    SET status = 'triggered', triggered_at = now()
    WHERE id = $1
  `, [alertId]);
}

export async function checkCostAlerts(clientKey) {
  const alerts = await getActiveAlerts(clientKey);
  const triggeredAlerts = [];
  
  for (const alert of alerts) {
    const budgetCheck = await checkBudgetExceeded(clientKey, alert.alert_type, alert.period);
    
    if (budgetCheck.exceeded && budgetCheck.current >= alert.threshold) {
      await triggerAlert(alert.id);
      triggeredAlerts.push({
        alert,
        budgetCheck,
        message: `Budget exceeded: ${alert.alert_type} ${alert.period} limit of $${alert.threshold} reached (current: $${budgetCheck.current.toFixed(2)})`
      });
    }
  }
  
  return triggeredAlerts;
}

// Analytics functions
export async function trackAnalyticsEvent({ clientKey, eventType, eventCategory, eventData, sessionId, userAgent, ipAddress }) {
  const eventDataJson = eventData ? JSON.stringify(eventData) : null;
  
  const { rows } = await query(`
    INSERT INTO analytics_events (client_key, event_type, event_category, event_data, session_id, user_agent, ip_address)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `, [clientKey, eventType, eventCategory, eventDataJson, sessionId, userAgent, ipAddress]);
  
  return rows[0];
}

export async function getAnalyticsEvents(clientKey, limit = 100, eventType = null) {
  let queryStr = `
    SELECT * FROM analytics_events 
    WHERE client_key = $1
  `;
  const params = [clientKey];
  
  if (eventType) {
    queryStr += ` AND event_type = $2`;
    params.push(eventType);
  }
  
  queryStr += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
  params.push(limit);
  
  const { rows } = await query(queryStr, params);
  return rows;
}

export async function getAnalyticsSummary(clientKey, days = 7) {
  const { rows } = await query(`
    SELECT 
      event_type,
      event_category,
      COUNT(*) as event_count,
      COUNT(DISTINCT session_id) as unique_sessions,
      COUNT(DISTINCT ip_address) as unique_ips
    FROM analytics_events 
    WHERE client_key = $1 
    AND created_at > now() - interval '${days} days'
    GROUP BY event_type, event_category
    ORDER BY event_count DESC
  `, [clientKey]);
  return rows;
}

// Conversion funnel functions
export async function trackConversionStage({ clientKey, leadPhone, stage, stageData, previousStage = null, timeToStage = null }) {
  const stageDataJson = stageData ? JSON.stringify(stageData) : null;
  
  const { rows } = await query(`
    INSERT INTO conversion_funnel (client_key, lead_phone, stage, stage_data, previous_stage, time_to_stage)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `, [clientKey, leadPhone, stage, stageDataJson, previousStage, timeToStage]);
  
  return rows[0];
}

export async function getConversionFunnel(clientKey, days = 30) {
  const { rows } = await query(`
    SELECT 
      stage,
      COUNT(*) as stage_count,
      COUNT(DISTINCT lead_phone) as unique_leads,
      AVG(time_to_stage) as avg_time_to_stage
    FROM conversion_funnel 
    WHERE client_key = $1 
    AND created_at > now() - interval '${days} days'
    GROUP BY stage
    ORDER BY stage_count DESC
  `, [clientKey]);
  return rows;
}

export async function getConversionRates(clientKey, days = 30) {
  const { rows } = await query(`
    WITH stage_counts AS (
      SELECT 
        stage,
        COUNT(DISTINCT lead_phone) as unique_leads
      FROM conversion_funnel 
      WHERE client_key = $1 
      AND created_at > now() - interval '${days} days'
      GROUP BY stage
    ),
    total_leads AS (
      SELECT COUNT(DISTINCT lead_phone) as total FROM conversion_funnel 
      WHERE client_key = $1 
      AND created_at > now() - interval '${days} days'
    )
    SELECT 
      sc.stage,
      sc.unique_leads,
      tl.total,
      ROUND((sc.unique_leads::DECIMAL / tl.total) * 100, 2) as conversion_rate
    FROM stage_counts sc
    CROSS JOIN total_leads tl
    ORDER BY sc.unique_leads DESC
  `, [clientKey]);
  return rows;
}

// Performance metrics functions
export async function recordPerformanceMetric({ clientKey, metricName, metricValue, metricUnit = null, metricCategory = null, metadata = null }) {
  const metadataJson = metadata ? JSON.stringify(metadata) : null;
  
  const { rows } = await query(`
    INSERT INTO performance_metrics (client_key, metric_name, metric_value, metric_unit, metric_category, metadata)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `, [clientKey, metricName, metricValue, metricUnit, metricCategory, metadataJson]);
  
  return rows[0];
}

export async function getPerformanceMetrics(clientKey, metricName = null, days = 7) {
  let queryStr = `
    SELECT 
      metric_name,
      metric_category,
      AVG(metric_value) as avg_value,
      MIN(metric_value) as min_value,
      MAX(metric_value) as max_value,
      COUNT(*) as sample_count
    FROM performance_metrics 
    WHERE client_key = $1 
    AND recorded_at > now() - interval '${days} days'
  `;
  const params = [clientKey];
  
  if (metricName) {
    queryStr += ` AND metric_name = $2`;
    params.push(metricName);
  }
  
  queryStr += ` GROUP BY metric_name, metric_category ORDER BY avg_value DESC`;
  
  const { rows } = await query(queryStr, params);
  return rows;
}

// A/B Testing functions
export async function createABTestExperiment({ clientKey, experimentName, variantName, variantConfig, isActive = true }) {
  const variantConfigJson = variantConfig ? JSON.stringify(variantConfig) : null;
  
  const { rows } = await query(`
    INSERT INTO ab_test_experiments (client_key, experiment_name, variant_name, variant_config, is_active)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `, [clientKey, experimentName, variantName, variantConfigJson, isActive]);
  
  return rows[0];
}

export async function getActiveABTests(clientKey) {
  const { rows } = await query(`
    SELECT * FROM ab_test_experiments 
    WHERE client_key = $1 AND is_active = TRUE
    ORDER BY created_at DESC
  `, [clientKey]);
  return rows;
}

export async function recordABTestResult({ experimentId, clientKey, leadPhone, variantName, outcome, outcomeData = null }) {
  const outcomeDataJson = outcomeData ? JSON.stringify(outcomeData) : null;
  
  const { rows } = await query(`
    INSERT INTO ab_test_results (experiment_id, client_key, lead_phone, variant_name, outcome, outcome_data)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `, [experimentId, clientKey, leadPhone, variantName, outcome, outcomeDataJson]);
  
  return rows[0];
}

export async function getABTestResults(experimentId) {
  const { rows } = await query(`
    SELECT 
      variant_name,
      outcome,
      COUNT(*) as result_count,
      COUNT(DISTINCT lead_phone) as unique_leads
    FROM ab_test_results 
    WHERE experiment_id = $1
    GROUP BY variant_name, outcome
    ORDER BY variant_name, result_count DESC
  `, [experimentId]);
  return rows;
}

export async function getABTestConversionRates(experimentId) {
  const { rows } = await query(`
    WITH variant_totals AS (
      SELECT 
        variant_name,
        COUNT(DISTINCT lead_phone) as total_leads
      FROM ab_test_results 
      WHERE experiment_id = $1
      GROUP BY variant_name
    ),
    variant_conversions AS (
      SELECT 
        variant_name,
        COUNT(DISTINCT lead_phone) as converted_leads
      FROM ab_test_results 
      WHERE experiment_id = $1 AND outcome = 'converted'
      GROUP BY variant_name
    )
    SELECT 
      vt.variant_name,
      vt.total_leads,
      COALESCE(vc.converted_leads, 0) as converted_leads,
      CASE 
        WHEN vt.total_leads > 0 
        THEN ROUND((COALESCE(vc.converted_leads, 0)::DECIMAL / vt.total_leads) * 100, 2)
        ELSE 0 
      END as conversion_rate
    FROM variant_totals vt
    LEFT JOIN variant_conversions vc ON vt.variant_name = vc.variant_name
    ORDER BY conversion_rate DESC
  `, [experimentId]);
  return rows;
}
