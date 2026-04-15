// db.js (ESM) — Postgres first, SQLite fallback, and helpers expected by server/libs
import { createHash } from 'crypto';
import { Pool } from 'pg';
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
import { getCache } from './lib/cache.js';
import {
  collectOutboundAbExperimentNamesFromMetadata,
  isOutboundAbLivePickupOutcome
} from './lib/outbound-ab-live-pickup.js';
import { getCallAnalyticsEnvOverrideIso } from './lib/call-analytics-cutoff.js';
import { activeRowsMatchOutboundAbStopSlice } from './lib/outbound-ab-stop-slice.js';
import { phoneMatchKey, pgQueueLeadPhoneKeyExpr, outboundDialClaimKeyFromRaw } from './lib/lead-phone-key.js';
import { normalizePhoneE164 } from './lib/utils.js';

const dbType = (process.env.DB_TYPE || '').toLowerCase();
let pool = null;
/** When set, caps simultaneous in-flight `pool.query` calls (whole process shares one limit). */
let pgQueryLimiter = null;
let sqlite = null;
let DB_PATH = 'postgres';

/**
 * Serialize excess load so small Postgres tiers are not hit by many parallel workers/webhooks at once.
 * @param {number} maxConcurrent
 */
function createQueryConcurrencyLimiter(maxConcurrent) {
  let active = 0;
  const queue = [];
  return {
    maxConcurrent,
    async run(fn) {
      if (active >= maxConcurrent) {
        await new Promise((resolve) => queue.push(resolve));
      }
      active++;
      try {
        return await fn();
      } finally {
        active--;
        const next = queue.shift();
        if (next) next();
      }
    }
  };
}

console.log('🔍 Database configuration:', {
  DB_TYPE: process.env.DB_TYPE,
  dbType: dbType,
  DATABASE_URL: process.env.DATABASE_URL ? 'SET' : 'NOT SET'
});

// JSON File Database fallback for Render
class JsonFileDatabase {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.dataFile = path.join(dataDir, 'database.json');
    this.data = this.loadData();
  }

  loadData() {
    try {
      if (fs.existsSync(this.dataFile)) {
        const content = fs.readFileSync(this.dataFile, 'utf8');
        return JSON.parse(content);
      }
    } catch (error) {
      console.error('Error loading JSON database:', error.message);
    }
    return {
      tenants: [],
      leads: [],
      bookings: [],
      api_keys: [],
      sms_conversations: [],
      email_templates: [],
      call_logs: []
    };
  }

  saveData() {
    try {
      fs.writeFileSync(this.dataFile, JSON.stringify(this.data, null, 2));
    } catch (error) {
      console.error('Error saving JSON database:', error.message);
    }
  }

  exec(sql) {
    // Simple SQL execution for JSON database
    // This is a basic implementation for Render compatibility
    console.log('📝 Executing SQL on JSON database:', sql.substring(0, 100) + '...');
  }

  prepare(sql) {
    return {
      all: (...params) => {
        const tableName = this.extractTableName(sql);
        return this.data[tableName] || [];
      },
      run: (...params) => {
        const tableName = this.extractTableName(sql);
        if (sql.includes('INSERT')) {
          const id = Date.now();
          this.data[tableName].push({ id, ...params[0] });
          this.saveData();
          return { changes: 1, lastInsertRowid: id };
        }
        return { changes: 0 };
      }
    };
  }

  extractTableName(sql) {
    const match = sql.match(/FROM\s+(\w+)/i) || sql.match(/INTO\s+(\w+)/i) || sql.match(/UPDATE\s+(\w+)/i);
    return match ? match[1] : 'leads';
  }
}

/**
 * Canonical tail-10 (etc.) key on leads — replaces UNIQUE(client_key, phone) after backfill + dedupe.
 */
async function migratePostgresLeadsPhoneMatchKey(pgPool) {
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

  // Dashboard lead_lookup CTE: DISTINCT ON (phone_match_key) ... ORDER BY created_at DESC
  // Needs (client_key, phone_match_key, created_at DESC) to avoid sorting/scanning many rows.
  await pgPool.query(`
    CREATE INDEX IF NOT EXISTS leads_client_phone_match_key_created_desc_idx
    ON leads (client_key, phone_match_key, created_at DESC)
    WHERE phone_match_key IS NOT NULL;
  `);

  console.log('✅ leads.phone_match_key migration complete');
}

/** Dashboard lead→first-call lateral join: indexable match on tail-10 digits (avoids regexp per call row). */
async function migratePostgresCallsLeadPhoneMatchKey(pgPool) {
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

async function migrateSqliteLeadsPhoneMatchKey() {
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
  const dupGroups = sqlite.prepare(`
    SELECT client_key, phone_match_key, MIN(id) AS keep_id
    FROM leads
    WHERE phone_match_key IS NOT NULL
    GROUP BY client_key, phone_match_key
    HAVING COUNT(*) > 1
  `).all();
  for (const g of dupGroups) {
    sqlite.prepare(
      `UPDATE appointments SET lead_id = ? WHERE lead_id IN (
        SELECT id FROM leads WHERE client_key = ? AND phone_match_key = ? AND id != ?
      )`
    ).run(g.keep_id, g.client_key, g.phone_match_key, g.keep_id);
    sqlite.prepare(
      `DELETE FROM leads WHERE client_key = ? AND phone_match_key = ? AND id != ?`
    ).run(g.client_key, g.phone_match_key, g.keep_id);
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

async function migrateSqliteCallsLeadPhoneMatchKey() {
  if (!sqlite) return;
  try {
    sqlite.exec('ALTER TABLE calls ADD COLUMN lead_phone_match_key TEXT');
  } catch {
    /* column may already exist */
  }
  try {
    const rows = sqlite.prepare('SELECT id, lead_phone FROM calls WHERE lead_phone_match_key IS NULL').all();
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

// ---------------------- Postgres ----------------------
async function initPostgres() {
  // Validate DATABASE_URL format
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  
  // Check if DATABASE_URL looks complete
  if (!dbUrl.includes('://') || !dbUrl.includes('@')) {
    console.warn('⚠️  DATABASE_URL format may be incomplete. Expected format: postgresql://user:password@host:port/database');
  }
  
  try {
    // Render Postgres often allows ~100 max_connections; the app should use a modest slice per process.
    // On Render, default 12 pool slots — basic tiers choke when the app opens many parallel queries.
    // Override with DB_POOL_MAX; cap avoids accidental runaway values.
    const rawMax = parseInt(process.env.DB_POOL_MAX, 10);
    const defaultPoolMax = process.env.RENDER === 'true' ? 12 : 25;
    const maxConnections =
      Number.isFinite(rawMax) && rawMax >= 2 ? Math.min(rawMax, 80) : defaultPoolMax;
    
    pool = new Pool({
      connectionString: dbUrl,
      ssl: { rejectUnauthorized: false },
      max: maxConnections,
      idleTimeoutMillis: 10000, // Close idle connections after 10 seconds (more aggressive)
      connectionTimeoutMillis: 5000, // Reduced to 5 seconds for faster failure detection
      statement_timeout: 20000, // 20 second query timeout to prevent hanging queries
      allowExitOnIdle: true, // Allow pool to close when idle
    });

    // Smooth spikes: cron + webhooks + queue workers often align; tiny Render Postgres cannot serve 20+ parallel queries.
    const rawQc = parseInt(process.env.DB_QUERY_CONCURRENCY, 10);
    let queryConc;
    if (rawQc === 0) {
      queryConc = null; // explicit disable
    } else if (Number.isFinite(rawQc) && rawQc > 0) {
      queryConc = Math.min(rawQc, maxConnections);
    } else if (process.env.RENDER === 'true') {
      queryConc = Math.min(8, maxConnections);
    } else {
      queryConc = null;
    }
    pgQueryLimiter = queryConc ? createQueryConcurrencyLimiter(queryConc) : null;
    if (pgQueryLimiter) {
      console.log(
        `🔌 DB query concurrency cap: ${queryConc} simultaneous queries (DB_QUERY_CONCURRENCY=0 disables)`
      );
    }

    console.log(`🔌 Database pool configured: max=${maxConnections} connections`);

    // Test connection first with timeout
    console.log('🔌 Testing Postgres connection...');
    await Promise.race([
      pool.query('SELECT 1'),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Connection timeout after 10 seconds')), 10000)
      )
    ]);
    console.log('✅ Postgres connection successful');
  } catch (error) {
    console.error('❌ Postgres connection failed:', error.message);
    if (pool) {
      try {
        await pool.end();
      } catch (e) {
        // Ignore cleanup errors
      }
      pool = null;
    }
    throw error;
  }

  try {
    // Run migrations for schema creation
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
      white_label_config JSONB,
      is_enabled BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    
    -- Add white_label_config column if it doesn't exist (migration)
    DO $$ 
    BEGIN 
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tenants' AND column_name = 'white_label_config'
      ) THEN
        ALTER TABLE tenants ADD COLUMN white_label_config JSONB;
      END IF;
    END $$;

    -- Index for listFullClients() ORDER BY created_at DESC (prevents full table scan + sort)
    CREATE INDEX IF NOT EXISTS idx_tenants_created_at ON tenants(created_at DESC);

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
    CREATE INDEX IF NOT EXISTS leads_client_created_idx ON leads(client_key, created_at DESC);
    -- queueNewLeadsForCalling: partial index + INCLUDE for index-only plans (reduces heap fetches on hot path)
    CREATE INDEX IF NOT EXISTS leads_queuer_new_created_cover_idx
      ON leads (client_key, created_at ASC)
      INCLUDE (id, name, phone, service, source, status)
      WHERE status = 'new';
    
    -- Add unique constraint on (client_key, phone) for ON CONFLICT support
    -- This allows upsert operations to prevent duplicate leads per client
    DO $$ 
    BEGIN 
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'leads_client_key_phone_unique'
      ) THEN
        ALTER TABLE leads ADD CONSTRAINT leads_client_key_phone_unique 
        UNIQUE (client_key, phone);
        RAISE NOTICE 'Added unique constraint: leads_client_key_phone_unique';
      END IF;
    END $$;

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
      lead_phone_match_key TEXT,
      status TEXT NOT NULL,
      outcome TEXT,
      duration INTEGER,
      cost DECIMAL(10,4),
      metadata JSONB,
      retry_attempt INTEGER DEFAULT 0,
      transcript TEXT,
      recording_url TEXT,
      sentiment TEXT,
      quality_score INTEGER,
      objections JSONB,
      key_phrases JSONB,
      metrics JSONB,
      analyzed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS calls_tenant_idx ON calls(client_key);
    CREATE INDEX IF NOT EXISTS calls_phone_idx ON calls(client_key, lead_phone);
    -- First outbound within window (dashboard lead → first call): seek by tenant + phone + time
    CREATE INDEX IF NOT EXISTS calls_client_phone_created_idx ON calls(client_key, lead_phone, created_at ASC);
    -- queueNewLeadsForCalling NOT EXISTS: in-flight dial for same tenant + phone
    CREATE INDEX IF NOT EXISTS calls_client_phone_active_status_idx
      ON calls (client_key, lead_phone)
      WHERE status IN ('initiated', 'in_progress');
    CREATE INDEX IF NOT EXISTS calls_status_idx ON calls(status);
    CREATE INDEX IF NOT EXISTS calls_outcome_idx ON calls(outcome);
    CREATE INDEX IF NOT EXISTS calls_created_idx ON calls(created_at);
    -- Dashboard / activity: filter by tenant and order by recency (avoids sorting all calls per tenant)
    CREATE INDEX IF NOT EXISTS calls_client_created_idx ON calls(client_key, created_at DESC);
    -- Recording / voicemail lists: filter by tenant + time without scanning full transcript rows
    CREATE INDEX IF NOT EXISTS calls_client_recording_created_idx ON calls(client_key, created_at DESC)
      WHERE recording_url IS NOT NULL AND recording_url <> '';
    -- Aligns with TRIM(recording_url) filters in /api/call-recordings and /api/voicemails
    CREATE INDEX IF NOT EXISTS calls_client_recording_trim_created_idx ON calls (client_key, created_at DESC)
      WHERE recording_url IS NOT NULL AND trim(recording_url) <> '';
    -- Voicemail listener: tenant + recency without scanning all recordings
    CREATE INDEX IF NOT EXISTS calls_client_voicemail_trim_created_desc_idx ON calls (client_key, created_at DESC)
      WHERE recording_url IS NOT NULL
        AND trim(recording_url) <> ''
        AND lower(coalesce(outcome, '')) = 'voicemail';
    -- Catch-up requeue: find failed_q backlog efficiently
    CREATE INDEX IF NOT EXISTS calls_failed_q_client_phone_created_desc_idx
      ON calls (client_key, lead_phone, created_at DESC)
      WHERE call_id LIKE 'failed_q%';

    -- Legacy: per-calendar-day dial claims. App no longer writes here (Mon–Fri journey uses outbound_weekday_journey). Kept for historical rows / optional TRUNCATE in ops.
    CREATE TABLE IF NOT EXISTS outbound_dial_daily_claim (
      id BIGSERIAL PRIMARY KEY,
      client_key TEXT NOT NULL REFERENCES tenants(client_key) ON DELETE CASCADE,
      phone_match_key TEXT NOT NULL,
      dial_date DATE NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE (client_key, phone_match_key, dial_date)
    );
    CREATE INDEX IF NOT EXISTS outbound_dial_daily_claim_lookup_idx
      ON outbound_dial_daily_claim (client_key, dial_date);

    -- Mon–Fri outbound journey: at most one attempt per weekday bucket per number; terminal when live pickup or all five buckets used.
    CREATE TABLE IF NOT EXISTS outbound_weekday_journey (
      client_key TEXT NOT NULL REFERENCES tenants(client_key) ON DELETE CASCADE,
      phone_match_key TEXT NOT NULL,
      weekday_mask SMALLINT NOT NULL DEFAULT 0,
      closed_at TIMESTAMPTZ,
      closed_reason TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now(),
      PRIMARY KEY (client_key, phone_match_key)
    );
    CREATE INDEX IF NOT EXISTS outbound_weekday_journey_client_idx
      ON outbound_weekday_journey (client_key);
    CREATE INDEX IF NOT EXISTS outbound_weekday_journey_closed_idx
      ON outbound_weekday_journey (client_key)
      WHERE closed_at IS NOT NULL;

    -- Aggregated transcript insights + routing recommendations (per tenant)
    CREATE TABLE IF NOT EXISTS call_insights (
      id BIGSERIAL PRIMARY KEY,
      client_key TEXT NOT NULL REFERENCES tenants(client_key) ON DELETE CASCADE,
      period_days INTEGER NOT NULL DEFAULT 30,
      insights JSONB NOT NULL,
      routing JSONB,
      computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE(client_key)
    );
    CREATE INDEX IF NOT EXISTS call_insights_client_idx ON call_insights(client_key);
    CREATE INDEX IF NOT EXISTS call_insights_computed_idx ON call_insights(computed_at DESC);

    -- Thompson sampling: per-tenant Beta posteriors for answered-rate by hour-of-day (local)
    CREATE TABLE IF NOT EXISTS call_time_bandit (
      client_key TEXT PRIMARY KEY REFERENCES tenants(client_key) ON DELETE CASCADE,
      arms JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS call_time_bandit_observations (
      call_id TEXT PRIMARY KEY,
      client_key TEXT NOT NULL REFERENCES tenants(client_key) ON DELETE CASCADE,
      hour SMALLINT NOT NULL,
      success BOOLEAN NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS bandit_obs_tenant_idx ON call_time_bandit_observations(client_key);
    CREATE INDEX IF NOT EXISTS bandit_obs_created_idx ON call_time_bandit_observations(client_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS call_schedule_decisions (
      id BIGSERIAL PRIMARY KEY,
      client_key TEXT NOT NULL REFERENCES tenants(client_key) ON DELETE CASCADE,
      baseline_at TIMESTAMPTZ NOT NULL,
      chosen_at TIMESTAMPTZ NOT NULL,
      source TEXT NOT NULL,
      hour_chosen SMALLINT,
      delay_minutes INT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS schedule_decisions_client_idx ON call_schedule_decisions(client_key, created_at DESC);

    -- Single row: calls before floor_at are excluded from bandit + call-insights-style analytics (set on first init).
    CREATE TABLE IF NOT EXISTS call_analytics_floor (
      id SMALLINT PRIMARY KEY CHECK (id = 1),
      floor_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS quality_alerts (
      id BIGSERIAL PRIMARY KEY,
      client_key TEXT NOT NULL REFERENCES tenants(client_key) ON DELETE CASCADE,
      alert_type TEXT NOT NULL,
      severity TEXT NOT NULL,
      metric TEXT,
      actual_value TEXT,
      expected_value TEXT,
      message TEXT NOT NULL,
      action TEXT,
      impact TEXT,
      metadata JSONB,
      resolved BOOLEAN DEFAULT FALSE,
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS quality_alerts_client_created_idx ON quality_alerts(client_key, created_at DESC);
    
    -- Objections tracking table
    CREATE TABLE IF NOT EXISTS objections (
      id BIGSERIAL PRIMARY KEY,
      client_key TEXT NOT NULL,
      call_id TEXT,
      lead_phone TEXT NOT NULL,
      objection_type TEXT NOT NULL,
      objection_text TEXT NOT NULL,
      response_used TEXT NOT NULL,
      outcome TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS objections_type_outcome_idx ON objections(objection_type, outcome);
    CREATE INDEX IF NOT EXISTS objections_client_idx ON objections(client_key, created_at DESC);
    
    -- Lead intelligence tracking
    CREATE TABLE IF NOT EXISTS lead_engagement (
      id BIGSERIAL PRIMARY KEY,
      client_key TEXT NOT NULL,
      lead_phone TEXT NOT NULL,
      lead_score INTEGER DEFAULT 50,
      followup_score INTEGER DEFAULT 50,
      optimal_channel TEXT DEFAULT 'sms',
      engagement_data JSONB,
      last_updated TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(client_key, lead_phone)
    );
    CREATE INDEX IF NOT EXISTS lead_engagement_phone_idx ON lead_engagement(client_key, lead_phone);
    CREATE INDEX IF NOT EXISTS lead_engagement_score_idx ON lead_engagement(lead_score DESC);
    
    -- Client referrals tracking
    CREATE TABLE IF NOT EXISTS referrals (
      id BIGSERIAL PRIMARY KEY,
      referrer_client_key TEXT NOT NULL,
      referred_client_key TEXT,
      referred_email TEXT,
      referred_phone TEXT,
      status TEXT DEFAULT 'pending',
      reward_type TEXT,
      reward_value NUMERIC,
      reward_redeemed BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      converted_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS referrals_referrer_idx ON referrals(referrer_client_key, status);
    
    -- Success benchmarks tracking
    CREATE TABLE IF NOT EXISTS client_goals (
      id BIGSERIAL PRIMARY KEY,
      client_key TEXT NOT NULL,
      month TEXT NOT NULL,
      goal_appointments INTEGER,
      goal_conversion_rate NUMERIC,
      goal_revenue NUMERIC,
      actual_appointments INTEGER DEFAULT 0,
      actual_conversion_rate NUMERIC DEFAULT 0,
      actual_revenue NUMERIC DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(client_key, month)
    );
    CREATE INDEX IF NOT EXISTS client_goals_month_idx ON client_goals(client_key, month);

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
    -- Pending work due soon (processWebhookRetryQueue, getPendingRetries, follow-ups)
    CREATE INDEX IF NOT EXISTS retry_queue_pending_scheduled_idx ON retry_queue (scheduled_for ASC) WHERE status = 'pending';
    -- Prefix LIKE 'webhook_%' + pending (lib/webhook-retry.js)
    CREATE INDEX IF NOT EXISTS retry_queue_pending_type_pattern_idx ON retry_queue (retry_type varchar_pattern_ops) WHERE status = 'pending';
    -- Webhook retry due scan: pending + retry_type LIKE 'webhook_%' + ORDER BY scheduled_for
    CREATE INDEX IF NOT EXISTS retry_queue_pending_webhook_type_scheduled_idx
      ON retry_queue (retry_type varchar_pattern_ops, scheduled_for ASC)
      WHERE status = 'pending';
    -- Prefix LIKE 'appointment\_reminder%' / 'follow\_up\_%' ESCAPE '\\' + pending + scheduled (lib/database-health.js)
    CREATE INDEX IF NOT EXISTS retry_queue_pending_reason_scheduled_idx
      ON retry_queue (retry_reason varchar_pattern_ops, scheduled_for ASC)
      WHERE status = 'pending';
    -- Stale processing reset: WHERE status = 'processing' AND updated_at < ...
    CREATE INDEX IF NOT EXISTS retry_queue_processing_updated_idx ON retry_queue (updated_at) WHERE status = 'processing';
    -- Include id for index-only stale scans + deterministic tie-break
    CREATE INDEX IF NOT EXISTS retry_queue_processing_updated_id_idx
      ON retry_queue (updated_at ASC, id ASC) WHERE status = 'processing';
    -- Dashboard /api/retry-queue/:clientKey — filter by tenant + pending + ORDER BY scheduled_for
    CREATE INDEX IF NOT EXISTS retry_queue_client_pending_scheduled_idx
      ON retry_queue (client_key, scheduled_for ASC NULLS LAST) WHERE status = 'pending';

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
    -- Backfill / migration support for older databases
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'call_queue' AND column_name = 'initiated_call_id'
      ) THEN
        ALTER TABLE call_queue ADD COLUMN initiated_call_id TEXT;
      END IF;
    END $$;
    -- DB-level guard: never allow a row to be marked completed unless we have an initiated call id.
    -- Use NOT VALID so we can add without scanning existing rows; it will still enforce on new writes.
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'call_queue_completed_requires_call_id'
      ) THEN
        ALTER TABLE call_queue
          ADD CONSTRAINT call_queue_completed_requires_call_id
          CHECK (status <> 'completed' OR initiated_call_id IS NOT NULL) NOT VALID;
      END IF;
    END $$;
    CREATE INDEX IF NOT EXISTS call_queue_tenant_idx ON call_queue(client_key);
    CREATE INDEX IF NOT EXISTS call_queue_scheduled_idx ON call_queue(scheduled_for);
    CREATE INDEX IF NOT EXISTS call_queue_status_idx ON call_queue(status);
    CREATE INDEX IF NOT EXISTS call_queue_priority_idx ON call_queue(priority);
    CREATE INDEX IF NOT EXISTS call_queue_phone_idx ON call_queue(client_key, lead_phone);
    -- queueNewLeadsForCalling NOT EXISTS: pending queue row for same tenant + phone
    CREATE INDEX IF NOT EXISTS call_queue_client_phone_pending_idx
      ON call_queue (client_key, lead_phone)
      WHERE status = 'pending';
    CREATE INDEX IF NOT EXISTS call_queue_initiated_call_id_idx ON call_queue(initiated_call_id) WHERE initiated_call_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS call_queue_pending_scheduled_idx ON call_queue (scheduled_for ASC) WHERE status = 'pending';
    CREATE INDEX IF NOT EXISTS call_queue_processing_updated_idx ON call_queue (updated_at) WHERE status = 'processing';
    -- Fast due scan: WHERE status='pending' AND scheduled_for<=now() ORDER BY priority, scheduled_for LIMIT N
    CREATE INDEX IF NOT EXISTS call_queue_pending_priority_scheduled_idx
      ON call_queue (priority ASC, scheduled_for ASC)
      WHERE status = 'pending';
    -- Due worker: ORDER BY scheduled_for, priority avoids scanning all future high-priority rows first
    CREATE INDEX IF NOT EXISTS call_queue_pending_scheduled_priority_idx
      ON call_queue (scheduled_for ASC, priority ASC)
      WHERE status = 'pending';
    -- Include id for index-only stale scans + deterministic tie-break
    CREATE INDEX IF NOT EXISTS call_queue_processing_updated_id_idx
      ON call_queue (updated_at ASC, id ASC) WHERE status = 'processing';
    CREATE INDEX IF NOT EXISTS call_queue_client_pending_vapi_scheduled_idx
      ON call_queue (client_key, scheduled_for ASC NULLS LAST)
      WHERE status = 'pending' AND call_type = 'vapi_call';

    CREATE TABLE IF NOT EXISTS cost_tracking (
      id BIGSERIAL PRIMARY KEY,
      client_key TEXT NOT NULL REFERENCES tenants(client_key) ON DELETE CASCADE,
      call_id TEXT,
      cost_type TEXT NOT NULL,
      amount DECIMAL(10,4) NOT NULL,
      currency TEXT DEFAULT 'GBP',
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
      currency TEXT DEFAULT 'GBP',
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

    CREATE TABLE IF NOT EXISTS dead_letter_queue (
      id BIGSERIAL PRIMARY KEY,
      client_key TEXT NOT NULL REFERENCES tenants(client_key) ON DELETE CASCADE,
      original_table TEXT NOT NULL,
      original_id BIGINT,
      operation_type TEXT NOT NULL,
      payload JSONB NOT NULL,
      error_history JSONB,
      failure_reason TEXT,
      retry_count INTEGER DEFAULT 0,
      max_retries INTEGER,
      first_failed_at TIMESTAMPTZ,
      last_attempted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now(),
      resolved_at TIMESTAMPTZ,
      resolution_notes TEXT
    );
    CREATE INDEX IF NOT EXISTS dlq_client_idx ON dead_letter_queue(client_key);
    CREATE INDEX IF NOT EXISTS dlq_type_idx ON dead_letter_queue(operation_type);
    CREATE INDEX IF NOT EXISTS dlq_resolved_idx ON dead_letter_queue(resolved_at);
    CREATE INDEX IF NOT EXISTS dlq_created_idx ON dead_letter_queue(created_at);

    CREATE TABLE IF NOT EXISTS background_jobs (
      id BIGSERIAL PRIMARY KEY,
      job_id TEXT UNIQUE NOT NULL,
      client_key TEXT NOT NULL REFERENCES tenants(client_key) ON DELETE CASCADE,
      job_type TEXT NOT NULL,
      status TEXT NOT NULL,
      total_items INTEGER DEFAULT 0,
      processed_items INTEGER DEFAULT 0,
      error_count INTEGER DEFAULT 0,
      metadata JSONB,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now(),
      completed_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS bg_jobs_job_id_idx ON background_jobs(job_id);
    CREATE INDEX IF NOT EXISTS bg_jobs_client_idx ON background_jobs(client_key);
    CREATE INDEX IF NOT EXISTS bg_jobs_status_idx ON background_jobs(status);

    CREATE TABLE IF NOT EXISTS query_performance (
      id BIGSERIAL PRIMARY KEY,
      query_hash TEXT NOT NULL UNIQUE,
      query_preview TEXT,
      avg_duration DECIMAL(10,2),
      max_duration DECIMAL(10,2),
      call_count INTEGER DEFAULT 1,
      last_executed_at TIMESTAMPTZ DEFAULT now(),
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS query_perf_hash_unique_idx ON query_performance(query_hash);
    CREATE INDEX IF NOT EXISTS query_perf_hash_idx ON query_performance(query_hash);
    CREATE INDEX IF NOT EXISTS query_perf_duration_idx ON query_performance(avg_duration DESC);

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
    CREATE INDEX IF NOT EXISTS ab_test_experiments_client_active_created_idx
      ON ab_test_experiments (client_key, created_at DESC)
      WHERE is_active = TRUE;

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
    CREATE INDEX IF NOT EXISTS ab_test_results_experiment_outcome_idx ON ab_test_results (experiment_id, outcome);
    CREATE INDEX IF NOT EXISTS ab_test_results_tenant_idx ON ab_test_results(client_key);
    CREATE INDEX IF NOT EXISTS ab_test_results_phone_idx ON ab_test_results(client_key, lead_phone);
    CREATE INDEX IF NOT EXISTS ab_test_results_outcome_idx ON ab_test_results(outcome);

    CREATE TABLE IF NOT EXISTS user_accounts (
      id BIGSERIAL PRIMARY KEY,
      client_key TEXT NOT NULL REFERENCES tenants(client_key) ON DELETE CASCADE,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      permissions JSONB DEFAULT '[]',
      is_active BOOLEAN DEFAULT TRUE,
      last_login TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS user_accounts_client_idx ON user_accounts(client_key);
    CREATE INDEX IF NOT EXISTS user_accounts_username_idx ON user_accounts(username);
    CREATE INDEX IF NOT EXISTS user_accounts_email_idx ON user_accounts(email);
    CREATE INDEX IF NOT EXISTS user_accounts_role_idx ON user_accounts(role);

    CREATE TABLE IF NOT EXISTS api_keys (
      id BIGSERIAL PRIMARY KEY,
      client_key TEXT NOT NULL REFERENCES tenants(client_key) ON DELETE CASCADE,
      key_name TEXT NOT NULL,
      key_hash TEXT UNIQUE NOT NULL,
      permissions JSONB DEFAULT '[]',
      rate_limit_per_minute INTEGER DEFAULT 100,
      rate_limit_per_hour INTEGER DEFAULT 1000,
      is_active BOOLEAN DEFAULT TRUE,
      last_used TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS api_keys_client_idx ON api_keys(client_key);
    CREATE INDEX IF NOT EXISTS api_keys_hash_idx ON api_keys(key_hash);
    CREATE INDEX IF NOT EXISTS api_keys_active_idx ON api_keys(is_active);

    CREATE TABLE IF NOT EXISTS rate_limit_tracking (
      id BIGSERIAL PRIMARY KEY,
      client_key TEXT NOT NULL REFERENCES tenants(client_key) ON DELETE CASCADE,
      api_key_id BIGINT REFERENCES api_keys(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL,
      ip_address INET,
      request_count INTEGER DEFAULT 1,
      window_start TIMESTAMPTZ DEFAULT now(),
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS rate_limit_client_idx ON rate_limit_tracking(client_key);
    CREATE INDEX IF NOT EXISTS rate_limit_api_key_idx ON rate_limit_tracking(api_key_id);
    CREATE INDEX IF NOT EXISTS rate_limit_endpoint_idx ON rate_limit_tracking(endpoint);
    CREATE INDEX IF NOT EXISTS rate_limit_window_idx ON rate_limit_tracking(window_start);

    CREATE TABLE IF NOT EXISTS security_events (
      id BIGSERIAL PRIMARY KEY,
      client_key TEXT NOT NULL REFERENCES tenants(client_key) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      event_severity TEXT NOT NULL DEFAULT 'info',
      event_data JSONB,
      ip_address INET,
      user_agent TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS security_events_client_idx ON security_events(client_key);
    CREATE INDEX IF NOT EXISTS security_events_type_idx ON security_events(event_type);
    CREATE INDEX IF NOT EXISTS security_events_severity_idx ON security_events(event_severity);
    CREATE INDEX IF NOT EXISTS security_events_created_idx ON security_events(created_at);

    CREATE TABLE IF NOT EXISTS idempotency (
      client_key TEXT NOT NULL,
      key TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now(),
      PRIMARY KEY (client_key, key)
    );

    CREATE TABLE IF NOT EXISTS crm_integrations (
      id BIGSERIAL PRIMARY KEY,
      client_key TEXT NOT NULL REFERENCES tenants(client_key) ON DELETE CASCADE,
      crm_type TEXT NOT NULL CHECK (crm_type IN ('hubspot', 'salesforce')),
      settings JSONB NOT NULL DEFAULT '{}'::jsonb,
      enabled BOOLEAN DEFAULT TRUE,
      last_sync_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(client_key, crm_type)
    );
    CREATE INDEX IF NOT EXISTS crm_integrations_client_idx ON crm_integrations(client_key);
    CREATE INDEX IF NOT EXISTS crm_integrations_type_idx ON crm_integrations(crm_type);
    CREATE INDEX IF NOT EXISTS crm_integrations_enabled_idx ON crm_integrations(enabled);

    CREATE TABLE IF NOT EXISTS crm_sync_failures (
      id BIGSERIAL PRIMARY KEY,
      client_key TEXT NOT NULL REFERENCES tenants(client_key) ON DELETE CASCADE,
      crm_type TEXT NOT NULL CHECK (crm_type IN ('hubspot', 'salesforce')),
      operation TEXT NOT NULL,
      error_message TEXT NOT NULL,
      error_details JSONB,
      retry_count INTEGER DEFAULT 0,
      resolved BOOLEAN DEFAULT FALSE,
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS crm_sync_failures_client_idx ON crm_sync_failures(client_key);
    CREATE INDEX IF NOT EXISTS crm_sync_failures_type_idx ON crm_sync_failures(crm_type);
    CREATE INDEX IF NOT EXISTS crm_sync_failures_resolved_idx ON crm_sync_failures(resolved);
    CREATE INDEX IF NOT EXISTS crm_sync_failures_created_idx ON crm_sync_failures(created_at);
  `);

  // Add missing columns to existing tables (safe migration)
  // This handles cases where tables exist but are missing new columns
  try {
    console.log('🔄 Checking for missing columns in calls table...');
    
    // Add quality analysis columns if they don't exist
    await pool.query(`
      DO $$ 
      BEGIN
        -- Add transcript column
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='calls' AND column_name='transcript') THEN
          ALTER TABLE calls ADD COLUMN transcript TEXT;
          RAISE NOTICE 'Added column: transcript';
        END IF;
        
        -- Add recording_url column
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='calls' AND column_name='recording_url') THEN
          ALTER TABLE calls ADD COLUMN recording_url TEXT;
          RAISE NOTICE 'Added column: recording_url';
        END IF;
        
        -- Add sentiment column
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='calls' AND column_name='sentiment') THEN
          ALTER TABLE calls ADD COLUMN sentiment TEXT;
          RAISE NOTICE 'Added column: sentiment';
        END IF;
        
        -- Add quality_score column
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='calls' AND column_name='quality_score') THEN
          ALTER TABLE calls ADD COLUMN quality_score INTEGER;
          RAISE NOTICE 'Added column: quality_score';
        END IF;
        
        -- Add objections column
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='calls' AND column_name='objections') THEN
          ALTER TABLE calls ADD COLUMN objections JSONB;
          RAISE NOTICE 'Added column: objections';
        END IF;
        
        -- Add key_phrases column
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='calls' AND column_name='key_phrases') THEN
          ALTER TABLE calls ADD COLUMN key_phrases JSONB;
          RAISE NOTICE 'Added column: key_phrases';
        END IF;
        
        -- Add metrics column
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='calls' AND column_name='metrics') THEN
          ALTER TABLE calls ADD COLUMN metrics JSONB;
          RAISE NOTICE 'Added column: metrics';
        END IF;
        
        -- Add analyzed_at column
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='calls' AND column_name='analyzed_at') THEN
          ALTER TABLE calls ADD COLUMN analyzed_at TIMESTAMPTZ;
          RAISE NOTICE 'Added column: analyzed_at';
        END IF;
      END $$;
    `);
    
    // Add indexes for quality queries
    await pool.query(`
      CREATE INDEX IF NOT EXISTS calls_quality_idx ON calls(client_key, quality_score) WHERE quality_score IS NOT NULL;
      CREATE INDEX IF NOT EXISTS calls_sentiment_idx ON calls(client_key, sentiment) WHERE sentiment IS NOT NULL;
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS retry_queue_client_pending_scheduled_idx
        ON retry_queue (client_key, scheduled_for ASC NULLS LAST) WHERE status = 'pending';
      CREATE INDEX IF NOT EXISTS call_queue_client_pending_vapi_scheduled_idx
        ON call_queue (client_key, scheduled_for ASC NULLS LAST)
        WHERE status = 'pending' AND call_type = 'vapi_call';
      CREATE INDEX IF NOT EXISTS calls_client_recording_trim_created_idx ON calls (client_key, created_at DESC)
        WHERE recording_url IS NOT NULL AND trim(recording_url) <> '';
      CREATE INDEX IF NOT EXISTS calls_client_voicemail_trim_created_desc_idx ON calls (client_key, created_at DESC)
        WHERE recording_url IS NOT NULL
          AND trim(recording_url) <> ''
          AND lower(coalesce(outcome, '')) = 'voicemail';
      CREATE INDEX IF NOT EXISTS call_queue_client_vapi_completed_initiated_idx
        ON call_queue (client_key)
        WHERE status = 'completed' AND call_type = 'vapi_call' AND initiated_call_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS call_queue_pending_scheduled_priority_idx
        ON call_queue (scheduled_for ASC, priority ASC)
        WHERE status = 'pending';
      CREATE INDEX IF NOT EXISTS leads_queuer_new_created_cover_idx
        ON leads (client_key, created_at ASC)
        INCLUDE (id, name, phone, service, source, status)
        WHERE status = 'new';
    `).catch((idxErr) => {
      console.warn('⚠️  Dashboard perf index migration (non-fatal):', idxErr.message);
    });
    
    console.log('✅ Call quality columns migration complete');
  } catch (migrationError) {
    console.error('⚠️  Column migration error (non-fatal):', migrationError.message);
    // Don't fail startup if migration fails - columns might already exist
  }

  try {
    await migratePostgresLeadsPhoneMatchKey(pool);
  } catch (pkErr) {
    console.error('⚠️  leads phone_match_key migration error (non-fatal):', pkErr.message);
  }

  try {
    await migratePostgresCallsLeadPhoneMatchKey(pool);
  } catch (ckErr) {
    console.error('⚠️  calls lead_phone_match_key migration error (non-fatal):', ckErr.message);
  }

    DB_PATH = 'postgres';
    console.log('✅ DB: Postgres connected');
    return 'postgres';
  } catch (error) {
    console.error('⚠️  Postgres initialization error:', error.message);
    if (pool) {
      try {
        await pool.end();
      } catch (e) {
        // Ignore cleanup errors
      }
      pool = null;
    }
    throw error; // Re-throw to trigger SQLite fallback
  }
}

// ---------------------- SQLite fallback ----------------------
/** Older on-disk DBs may lack these tables; idempotent CREATE (also invoked at end of initSqlite). */
function ensureSqliteCallQueueAndQualityAlertsTables() {
  if (!sqlite) return;
  try {
    sqlite.exec(`
    CREATE TABLE IF NOT EXISTS call_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_key TEXT NOT NULL,
      lead_phone TEXT NOT NULL,
      priority INTEGER DEFAULT 5,
      scheduled_for TEXT NOT NULL,
      call_type TEXT NOT NULL,
      call_data TEXT,
      status TEXT DEFAULT 'pending',
      retry_attempt INTEGER DEFAULT 0,
      initiated_call_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (client_key) REFERENCES tenants(client_key) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS call_queue_sqlite_pending_scheduled_priority_idx
      ON call_queue (scheduled_for ASC, priority ASC)
      WHERE status = 'pending';
    CREATE TABLE IF NOT EXISTS quality_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_key TEXT NOT NULL,
      alert_type TEXT NOT NULL,
      severity TEXT NOT NULL,
      metric TEXT,
      actual_value TEXT,
      expected_value TEXT,
      message TEXT NOT NULL,
      action TEXT,
      impact TEXT,
      metadata TEXT,
      resolved INTEGER DEFAULT 0,
      resolved_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (client_key) REFERENCES tenants(client_key) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS quality_alerts_sqlite_client_created_idx
      ON quality_alerts (client_key, created_at DESC);
  `);
  } catch (e) {
    console.warn('[sqlite] ensure call_queue / quality_alerts:', e?.message || e);
  }
}

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
      white_label_config TEXT,
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
    CREATE TABLE IF NOT EXISTS outbound_weekday_journey (
      client_key TEXT NOT NULL,
      phone_match_key TEXT NOT NULL,
      weekday_mask INTEGER NOT NULL DEFAULT 0,
      closed_at TEXT,
      closed_reason TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (client_key, phone_match_key)
    );
    CREATE TABLE IF NOT EXISTS idempotency (
      client_key TEXT NOT NULL,
      key TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (client_key, key)
    );
    CREATE TABLE IF NOT EXISTS call_analytics_floor (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      floor_at TEXT NOT NULL
    );
  `);

  ensureSqliteCallQueueAndQualityAlertsTables();

  // avoid template literal parsing issues
  if (DB_PATH === 'json-file') {
    console.log('DB: JSON file database at ' + path.join(dataDir, 'database.json'));
    return 'json-file:' + path.join(dataDir, 'database.json');
  } else {
    console.log('DB: SQLite at ' + sqlitePath);
    return 'sqlite:' + sqlitePath;
  }
}

// ---------------------- Core API ----------------------
export async function init() {
  // Use PostgreSQL if explicitly configured
  if (dbType === 'postgres') {
    if (!process.env.DATABASE_URL) {
      throw new Error('❌ DATABASE_URL is required when DB_TYPE=postgres. Please set DATABASE_URL in your environment variables.');
    }
    
    console.log('🔄 Initializing PostgreSQL...');
    try {
      const r = await initPostgres();
      await getCallAnalyticsFloorIso().catch((e) =>
        console.warn('[call_analytics_floor] init:', e.message)
      );
      return r;
    } catch (error) {
      console.error('❌ PostgreSQL initialization failed:', error.message);
      
      // Provide helpful error messages
      if (error.message.includes('ENOTFOUND') || error.message.includes('getaddrinfo')) {
        console.error('\n💡 Postgres connection troubleshooting:');
        console.error('   1. Check if your database is paused (Render free tier pauses after inactivity)');
        console.error('   2. Verify DATABASE_URL is complete and correct');
        console.error('   3. Ensure the database hostname is reachable');
        console.error('   4. Check your Render dashboard and resume the database if paused\n');
      }
      
      throw new Error(`PostgreSQL connection failed: ${error.message}. Please fix your DATABASE_URL or set DB_TYPE to something other than 'postgres' to use SQLite.`);
    }
  }
  
  // Use SQLite (when DB_TYPE is not 'postgres' or not set)
  console.log('🔄 Initializing SQLite...');
  const r = initSqlite();
  await migrateSqliteLeadsPhoneMatchKey().catch((e) =>
    console.warn('⚠️  SQLite phone_match_key migration:', e.message)
  );
  await migrateSqliteCallsLeadPhoneMatchKey().catch((e) =>
    console.warn('⚠️  SQLite calls.lead_phone_match_key migration:', e.message)
  );
  await getCallAnalyticsFloorIso().catch((e) =>
    console.warn('[call_analytics_floor] init:', e.message)
  );
  return r;
}

// Enhanced database operations with comprehensive error handling
import { 
  DatabaseError, 
  ValidationError, 
  ConflictError, 
  NotFoundError,
  ErrorFactory 
} from './lib/errors.js';
import { getRetryManager } from './lib/retry-logic.js';

// Core query function with caching and performance tracking
async function query(text, params = []) {
  const cache = getCache();
  const cacheKey = `query:${text}:${JSON.stringify(params)}`;
  const upper = text.trim().toUpperCase();
  
  // For SELECT queries, check cache first
  if (upper.startsWith('SELECT')) {
    const cached = await cache.get(cacheKey);
    if (cached) {
      console.log('[DB CACHE] Serving cached query result');
      return cached;
    }
  }
  
  // Track query performance
  const startTime = Date.now();
  let result;
  
  try {
    if (dbType === 'postgres' && pool) {
      const exec = () => pool.query(text, params);
      result = pgQueryLimiter ? await pgQueryLimiter.run(exec) : await exec();
    } else if (sqlite) {
      // Convert PostgreSQL-style placeholders ($1, $2, etc.) to SQLite-style (?)
      let sqliteText = text;
      if (text.includes('$1')) {
        // Replace $1, $2, etc. with ?
        sqliteText = text.replace(/\$\d+/g, '?');
      }
      const sqliteParams = params.map((p) => (p instanceof Date ? p.toISOString() : p));
      const stmt = sqlite.prepare(sqliteText);
      const hasReturning = /\bRETURNING\b/i.test(text);
      const isSelectShape = upper.startsWith('SELECT') || upper.startsWith('WITH');
      if (isSelectShape) {
        result = { rows: stmt.all(...sqliteParams) };
      } else if (
        hasReturning &&
        (upper.startsWith('INSERT') || upper.startsWith('UPDATE') || upper.startsWith('DELETE'))
      ) {
        // INSERT/UPDATE/DELETE … RETURNING must use .all(); .run() drops returned rows on SQLite.
        result = { rows: stmt.all(...sqliteParams) };
      } else {
        result = stmt.run(...sqliteParams);
      }
    } else {
      // JSON fallback
      const jsonDb = new JsonFileDatabase('./data');
      const stmt = jsonDb.prepare(text);
      if (upper.startsWith('SELECT')) {
        result = { rows: stmt.all(...params) };
      } else {
        result = stmt.run(...params);
      }
    }
    
    const duration = Date.now() - startTime;
    
    // Track query performance (async, fire-and-forget, don't wait)
    // Use setImmediate to ensure tracking doesn't block query completion
    if (dbType === 'postgres' && duration >= 100) {
      setImmediate(() => {
        // Import and track asynchronously to avoid blocking
        import('./lib/query-performance-tracker.js').then(module => {
          module.trackQueryPerformance(text, duration, params).catch(() => {
            // Silently fail - don't log or break queries if tracking fails
          });
        }).catch(() => {
          // Silently fail - don't break queries if import fails
        });
      });
    }
    
    // Cache SELECT results for 5 minutes
    if (upper.startsWith('SELECT') && result.rows) {
      await cache.set(cacheKey, result, 300000); // 5 minutes
      console.log('[DB CACHE] Cached query result');
    }

    // If we mutated data, cached SELECTs may now be stale. Clear query cache.
    // This fixes endpoints (like lead import) that do "count before" -> write -> "count after"
    // and were incorrectly returning the cached pre-write counts.
    if (upper.startsWith('INSERT') || upper.startsWith('UPDATE') || upper.startsWith('DELETE') || upper.startsWith('UPSERT')) {
      try {
        await cache.clear();
        console.log('[DB CACHE] Cleared after mutation');
      } catch (e) {
        // Cache is best-effort; never fail the write.
      }
    }
    
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    // Still track failed queries for analysis
    if (dbType === 'postgres' && duration >= 100) {
      import('./lib/query-performance-tracker.js').then(module => {
        module.trackQueryPerformance(text, duration, params).catch(() => {});
      });
    }
    throw error;
  }
}

/**
 * Hot-path SELECT: uses pool.query directly (no pgQueryLimiter, no SELECT cache, no perf tracker).
 * For trivial indexed reads that must not queue behind heavy dashboard/worker traffic.
 */
export async function poolQuerySelect(text, params = []) {
  if (dbType === 'postgres' && pool) {
    return pool.query(text, params);
  }
  return query(text, params);
}

// Wrap database operations with error handling
async function safeQuery(text, params = []) {
  const retryManager = getRetryManager({
    maxRetries: 3,
    baseDelay: 1000,
    retryCondition: (error) => {
      // Retry on connection errors and timeouts
      const msg = String(error?.message || '');
      return error.code === 'ECONNREFUSED' || 
             error.code === 'ETIMEDOUT' ||
             error.code === 'ENOTFOUND' ||
             msg.includes('Timeout exceeded when trying to connect') ||
             (error.status >= 500 && error.status < 600);
    }
  });

  try {
    return await retryManager.execute(
      () => query(text, params),
      { operation: 'database_query', query: text.substring(0, 100) }
    );
  } catch (error) {
    // Convert database errors to application errors
    throw ErrorFactory.fromDatabaseError(error, 'query');
  }
}

/** Release the SQLite connection (e.g. :memory: tests so Jest can exit cleanly). No-op on Postgres. */
export function closeSqliteForTesting() {
  try {
    if (sqlite) sqlite.close();
  } catch (_) {
    /* ignore */
  }
  sqlite = null;
}

/** Tests: end Postgres pool and/or close SQLite. */
export async function closeDatabaseConnectionsForTests() {
  try {
    if (pool) await pool.end();
  } catch (_) {
    /* ignore */
  }
  pool = null;
  closeSqliteForTesting();
}

export { DB_PATH, query, pool, dbType };

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
  const whiteLabel = toJson(r.white_label_config) || {};

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
    whiteLabel,
    isEnabled: r.is_enabled === true || r.is_enabled === 1,
    createdAt: r.created_at
  };
  out.vapiAssistantId = vapi.assistantId || null;
  out.vapiPhoneNumberId = vapi.phoneNumberId || null;
  out.serviceMap = (calendar.services) || {};
  
  // Extract additional fields from whiteLabel config (saved by create-demo-client script)
  if (whiteLabel.branding) {
    out.logo = whiteLabel.branding.logo || null;
    out.primaryColor = whiteLabel.branding.primaryColor || null;
    out.secondaryColor = whiteLabel.branding.secondaryColor || null;
    out.accentColor = whiteLabel.branding.accentColor || null;
    out.fontFamily = whiteLabel.branding.fontFamily || null;
  }
  if (whiteLabel.description) out.description = whiteLabel.description;
  if (whiteLabel.tagline) out.tagline = whiteLabel.tagline;
  if (whiteLabel.status) out.status = whiteLabel.status;
  if (whiteLabel.industry) out.industry = whiteLabel.industry;
  if (whiteLabel.services) out.services = whiteLabel.services;
  if (whiteLabel.location) out.location = whiteLabel.location;
  
  // Extract business name from whiteLabel if display_name is missing
  if (!out.displayName) {
    out.displayName = whiteLabel.name || whiteLabel.businessName || whiteLabel.branding?.name || whiteLabel.branding?.businessName || null;
  }
  
  // Extract from top-level whiteLabel or from numbers
  if (whiteLabel.phone) {
    out.phone = whiteLabel.phone;
  } else if (numbers.primary) {
    out.phone = numbers.primary;
  }
  
  // Extract business hours from booking or whiteLabel
  if (whiteLabel.businessHours) {
    out.businessHours = whiteLabel.businessHours;
  } else if (out.booking && out.booking.businessHours) {
    out.businessHours = out.booking.businessHours;
  }

  if (whiteLabel.pricing && typeof whiteLabel.pricing === 'object') {
    out.pricing = { ...whiteLabel.pricing };
    if (whiteLabel.pricing.monthlyFee != null) out.monthlyFee = whiteLabel.pricing.monthlyFee;
    if (whiteLabel.pricing.avgDealValue != null) out.avgDealValue = whiteLabel.pricing.avgDealValue;
  }
  if (whiteLabel.monthlyFee != null) out.monthlyFee = whiteLabel.monthlyFee;
  if (whiteLabel.avgDealValue != null) out.avgDealValue = whiteLabel.avgDealValue;
  
  // Also set name for compatibility (same as displayName)
  out.name = out.displayName;
  
  return out;
}

// List cache: short TTL to reduce repeated full-table reads (listFullClients is hot)
const listFullClientsCache = { data: null, expires: 0 };
const LIST_FULL_CLIENTS_TTL = 60 * 1000; // 1 minute

// Summary list cache: avoids large JSON columns for admin/analytics pages
const listClientSummariesCache = { data: null, expires: 0 };
const LIST_CLIENT_SUMMARIES_TTL = 60 * 1000; // 1 minute

export async function listClientSummaries() {
  if (listClientSummariesCache.data !== null && Date.now() < listClientSummariesCache.expires) {
    return listClientSummariesCache.data;
  }

  const { rows } = await query(`
    SELECT client_key, display_name, timezone, locale, is_enabled, created_at,
           vapi_json, white_label_config
    FROM tenants
    ORDER BY created_at DESC
  `);

  const data = rows.map(r => ({
    clientKey: r.client_key,
    displayName: r.display_name,
    timezone: r.timezone,
    locale: r.locale,
    isEnabled: r.is_enabled,
    createdAt: r.created_at,
    email: (r?.vapi_json && typeof r.vapi_json === 'object')
      ? (r.vapi_json.email || r.vapi_json.client_email || null)
      : null,
    industry: (r?.white_label_config && typeof r.white_label_config === 'object')
      ? (r.white_label_config.industry || null)
      : null
  }));

  listClientSummariesCache.data = data;
  listClientSummariesCache.expires = Date.now() + LIST_CLIENT_SUMMARIES_TTL;
  return data;
}

export async function listFullClients() {
  if (listFullClientsCache.data !== null && Date.now() < listFullClientsCache.expires) {
    return listFullClientsCache.data;
  }
  const { rows } = await query(`
    SELECT client_key, display_name, timezone, locale,
           numbers_json, twilio_json, vapi_json, calendar_json, sms_templates_json, 
           white_label_config, is_enabled, created_at
    FROM tenants ORDER BY created_at DESC
  `);
  const data = rows.map(mapTenantRow);
  listFullClientsCache.data = data;
  listFullClientsCache.expires = Date.now() + LIST_FULL_CLIENTS_TTL;
  return data;
}

// Client cache with 5-minute TTL
const clientCache = new Map();
const CLIENT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * @param {string} clientKey
 * @param {{ bypassCache?: boolean }} [options] When bypassCache is true, always read from DB (needed for dashboard: cache is per-process, so another worker may have stale vapi after a config update).
 */
export async function getFullClient(clientKey, options = {}) {
  const bypassCache = options && typeof options === 'object' && options.bypassCache === true;
  const cacheKey = `client:${clientKey}`;

  if (!bypassCache) {
    const cached = clientCache.get(cacheKey);
    if (cached && Date.now() < cached.expires) {
      return cached.data;
    }
  }

  // Fetch from database
  const { rows } = await query(`
    SELECT client_key, display_name, timezone, locale,
           numbers_json, twilio_json, vapi_json, calendar_json, sms_templates_json, 
           white_label_config, is_enabled, created_at
    FROM tenants WHERE client_key = $1
  `, [clientKey]);
  
  const client = mapTenantRow(rows[0]);
  
  // Cache the result
  if (client) {
    clientCache.set(cacheKey, {
      data: client,
      expires: Date.now() + CLIENT_CACHE_TTL
    });
  }
  
  return client;
}

// Invalidate client cache (call after updates)
export function invalidateClientCache(clientKey) {
  clientCache.delete(`client:${clientKey}`);
  // Also clear any related caches
  for (const key of clientCache.keys()) {
    if (key.includes(clientKey)) {
      clientCache.delete(key);
    }
  }
  // Invalidate list cache so new/updated clients appear
  listFullClientsCache.data = null;
  listFullClientsCache.expires = 0;
  listClientSummariesCache.data = null;
  listClientSummariesCache.expires = 0;
}

/**
 * Execute a function within a database transaction
 * Automatically commits on success, rolls back on error
 */
export async function withTransaction(callback) {
  if (!pool) {
    // No pool, execute without transaction
    return await callback(query);
  }
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Create a transaction-scoped query function
    const txQuery = async (text, params) => {
      const result = await client.query(text, params);
      return result;
    };
    
    const result = await callback(txQuery);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Cleanup expired cache entries periodically
if (typeof setInterval !== 'undefined') {
  const clientCacheSweep = setInterval(() => {
    const now = Date.now();
    for (const [key, value] of clientCache.entries()) {
      if (now >= value.expires) {
        clientCache.delete(key);
      }
    }
  }, 10 * 60 * 1000); // Every 10 minutes
  if (typeof clientCacheSweep?.unref === 'function') clientCacheSweep.unref();
}

export async function upsertFullClient(c) {
  // Invalidate cache before update
  if (c.clientKey) {
    invalidateClientCache(c.clientKey);
  }
  const existingRow = c.clientKey ? await getFullClient(c.clientKey) : null;
  const baseVapi =
    existingRow?.vapi && typeof existingRow.vapi === 'object' && !Array.isArray(existingRow.vapi)
      ? { ...existingRow.vapi }
      : {};
  let vapi;
  if (c.vapi === undefined) {
    vapi = baseVapi;
  } else if (c.vapi === null) {
    vapi = {};
  } else if (typeof c.vapi === 'object' && !Array.isArray(c.vapi)) {
    vapi = { ...baseVapi, ...c.vapi };
  } else {
    vapi = baseVapi;
  }
  const numbers_json = c.numbers ? JSON.stringify(c.numbers) : null;
  const twilio_json = c.sms ? JSON.stringify(c.sms) : null;
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
  
  // Build comprehensive whiteLabel config with all fields from create-demo-client script
  const whiteLabel = c.whiteLabel || {};
  // Merge in additional fields if provided directly (for backward compatibility)
  if (c.description) whiteLabel.description = c.description;
  if (c.tagline) whiteLabel.tagline = c.tagline;
  if (c.status) whiteLabel.status = c.status;
  if (c.industry) whiteLabel.industry = c.industry;
  if (c.services) whiteLabel.services = c.services;
  if (c.location) whiteLabel.location = c.location;
  if (c.phone) whiteLabel.phone = c.phone;
  if (c.businessHours) whiteLabel.businessHours = c.businessHours;
  // Store business name in whiteLabel as backup (for dashboard personalization)
  if (c.displayName || c.name || c.businessName) {
    whiteLabel.name = c.displayName || c.name || c.businessName;
    whiteLabel.businessName = c.displayName || c.name || c.businessName;
  }
  // Merge branding fields
  if (!whiteLabel.branding) whiteLabel.branding = {};
  if (c.logo) whiteLabel.branding.logo = c.logo;
  if (c.primaryColor) whiteLabel.branding.primaryColor = c.primaryColor;
  if (c.secondaryColor) whiteLabel.branding.secondaryColor = c.secondaryColor;
  if (c.accentColor) whiteLabel.branding.accentColor = c.accentColor;
  if (c.fontFamily) whiteLabel.branding.fontFamily = c.fontFamily;
  
  const white_label_config = Object.keys(whiteLabel).length > 0 ? JSON.stringify(whiteLabel) : null;

  const args = [
    c.clientKey, c.displayName || c.clientKey, c.booking?.timezone || c.timezone || null, c.locale || 'en-GB',
    numbers_json, twilio_json, vapi_json, calendar_json, sms_templates_json, white_label_config
  ];

  if (pool) {
    await query(`
      INSERT INTO tenants (client_key, display_name, timezone, locale, numbers_json, twilio_json, vapi_json, calendar_json, sms_templates_json, white_label_config)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT (client_key) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        timezone = EXCLUDED.timezone,
        locale = EXCLUDED.locale,
        numbers_json = EXCLUDED.numbers_json,
        twilio_json = EXCLUDED.twilio_json,
        vapi_json = EXCLUDED.vapi_json,
        calendar_json = EXCLUDED.calendar_json,
        sms_templates_json = EXCLUDED.sms_templates_json,
        white_label_config = EXCLUDED.white_label_config
    `, args);
  } else {
    const row = sqlite.prepare('SELECT client_key FROM tenants WHERE client_key=?').get(c.clientKey);
    if (row) {
      sqlite.prepare('UPDATE tenants SET display_name=?, timezone=?, locale=?, numbers_json=?, twilio_json=?, vapi_json=?, calendar_json=?, sms_templates_json=?, white_label_config=? WHERE client_key=?')
        .run(args[1], args[2], args[3], args[4], args[5], args[6], args[7], args[8], args[9], args[0]);
    } else {
      sqlite.prepare('INSERT INTO tenants (client_key, display_name, timezone, locale, numbers_json, twilio_json, vapi_json, calendar_json, sms_templates_json, white_label_config) VALUES (?,?,?,?,?,?,?,?,?,?)')
        .run(...args);
    }
  }
  return true;
}

export async function deleteClient(clientKey) {
  invalidateClientCache(clientKey);
  return await query('DELETE FROM tenants WHERE client_key = $1', [clientKey]);
}

// Extra helpers some libs call
export async function findOrCreateLead({ tenantKey, phone, name = null, service = null, source = null }) {
  const mk = phoneMatchKey(phone);
  let out = await query(
    mk
      ? 'SELECT * FROM leads WHERE client_key=$1 AND phone_match_key=$2 ORDER BY created_at DESC LIMIT 1'
      : 'SELECT * FROM leads WHERE client_key=$1 AND phone=$2 ORDER BY created_at DESC LIMIT 1',
    mk ? [tenantKey, mk] : [tenantKey, phone]
  );
  if (out.rows && out.rows.length) return out.rows[0];
  out = await query(
    'INSERT INTO leads (client_key, name, phone, phone_match_key, service, source) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
    [tenantKey, name, phone, mk, service, source]
  );
  if (out.rows) return out.rows[0];
  const row = sqlite.prepare('SELECT last_insert_rowid() as id').get();
  return { id: row?.id, client_key: tenantKey, name, phone, phone_match_key: mk, service, source };
}

export async function getLeadsByClient(clientKey, limit = 100) {
  const result = await query(
    'SELECT * FROM leads WHERE client_key=$1 ORDER BY created_at DESC LIMIT $2',
    [clientKey, limit]
  );
  return result.rows || [];
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
export async function upsertCall({ 
  callId, 
  clientKey, 
  leadPhone, 
  status, 
  outcome, 
  duration, 
  cost, 
  metadata, 
  retryAttempt = 0,
  // Quality fields (NEW)
  transcript,
  recordingUrl,
  sentiment,
  qualityScore,
  objections,
  keyPhrases,
  metrics,
  analyzedAt
}) {
  const metadataJson = metadata ? JSON.stringify(metadata) : null;
  const objectionsJson = objections ? JSON.stringify(objections) : null;
  const keyPhrasesJson = keyPhrases ? JSON.stringify(keyPhrases) : null;
  const metricsJson = metrics ? JSON.stringify(metrics) : null;
  const leadPhoneMatchKey = phoneMatchKey(leadPhone);

  await query(`
    INSERT INTO calls (
      call_id, client_key, lead_phone, lead_phone_match_key, status, outcome, duration, cost, metadata, retry_attempt,
      transcript, recording_url, sentiment, quality_score, objections, key_phrases, metrics, analyzed_at,
      updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, now())
    ON CONFLICT (call_id) 
    DO UPDATE SET 
      lead_phone = EXCLUDED.lead_phone,
      lead_phone_match_key = EXCLUDED.lead_phone_match_key,
      status = EXCLUDED.status,
      outcome = EXCLUDED.outcome,
      duration = EXCLUDED.duration,
      cost = EXCLUDED.cost,
      metadata = COALESCE(calls.metadata, '{}'::jsonb) || COALESCE(EXCLUDED.metadata, '{}'::jsonb),
      retry_attempt = EXCLUDED.retry_attempt,
      transcript = EXCLUDED.transcript,
      recording_url = EXCLUDED.recording_url,
      sentiment = EXCLUDED.sentiment,
      quality_score = EXCLUDED.quality_score,
      objections = EXCLUDED.objections,
      key_phrases = EXCLUDED.key_phrases,
      metrics = EXCLUDED.metrics,
      analyzed_at = EXCLUDED.analyzed_at,
      updated_at = now()
  `, [
    callId, clientKey, leadPhone, leadPhoneMatchKey, status, outcome, duration, cost, metadataJson, retryAttempt,
    transcript, recordingUrl, sentiment, qualityScore, objectionsJson, keyPhrasesJson, metricsJson, analyzedAt
  ]);
}

/**
 * Remove outbound weekday journey row so automated dials can start a fresh Mon–Fri journey for this number.
 * @returns {Promise<{ ok: boolean, deleted?: number, reason?: string }>}
 */
export async function clearOutboundWeekdayJourneyForReopen(clientKey, leadPhone) {
  const raw = leadPhone != null ? String(leadPhone).trim() : '';
  if (!clientKey || !raw) return { ok: false, reason: 'invalid' };
  const claimKey = outboundDialClaimKeyFromRaw(raw);
  const r = await query(
    `DELETE FROM outbound_weekday_journey WHERE client_key = $1 AND phone_match_key = $2`,
    [clientKey, claimKey]
  );
  const deleted = r?.rowCount ?? r?.changes ?? 0;
  return { ok: true, deleted };
}

/** Mon=1 … Fri=16; all five weekday buckets used in one journey. */
const OUTBOUND_WEEKDAY_FULL_MASK = 31;

function tenantLocalWeekdayBitLuxon(weekday) {
  if (weekday < 1 || weekday > 5) return 0;
  return 1 << (weekday - 1);
}

function outboundBypassMultiplePerDay() {
  return /^(1|true|yes)$/i.test(String(process.env.ALLOW_MULTIPLE_OUTBOUND_CALLS_PER_DAY || '').trim());
}

/**
 * Whether an automated outbound dial should be skipped for this number right now:
 * journey already terminal (live pickup or five weekday buckets used), or today's weekday bucket already claimed.
 * Opt out: ALLOW_MULTIPLE_OUTBOUND_CALLS_PER_DAY=1|true|yes
 * @param {{ asOf?: Date }} [opts] Optional clock for tests (`asOf` must fall on a Mon–Fri local day to exercise weekday_mask).
 * @returns {{ blocked: boolean, reason?: string, terminal?: boolean }}
 */
export async function hasOutboundWeekdayJourneyDialBlocked(clientKey, leadPhone, timezone = 'Europe/London', opts = {}) {
  if (outboundBypassMultiplePerDay()) {
    return { blocked: false };
  }
  const raw = leadPhone != null ? String(leadPhone).trim() : '';
  if (!clientKey || !raw) return { blocked: false };
  const claimKey = outboundDialClaimKeyFromRaw(raw);
  const { DateTime } = await import('luxon');
  const tz = timezone || 'Europe/London';
  const local =
    opts?.asOf instanceof Date && Number.isFinite(opts.asOf.getTime())
      ? DateTime.fromJSDate(opts.asOf, { zone: tz })
      : DateTime.now().setZone(tz);
  const dayBit = tenantLocalWeekdayBitLuxon(local.weekday);

  if (dbType === 'postgres' && pool) {
    const exec = () =>
      pool.query(
        `
      SELECT weekday_mask, closed_at, closed_reason
      FROM outbound_weekday_journey
      WHERE client_key = $1 AND phone_match_key = $2
      LIMIT 1
      `,
        [clientKey, claimKey]
      );
    const { rows } = pgQueryLimiter ? await pgQueryLimiter.run(exec) : await exec();
    const row = rows[0];
    if (!row) return { blocked: false };
    if (row.closed_at) {
      return { blocked: true, reason: 'journey_terminal', terminal: true };
    }
    const mask = Number(row.weekday_mask || 0);
    if (dayBit && (mask & dayBit) !== 0) {
      return { blocked: true, reason: 'weekday_slot_used', terminal: false };
    }
    return { blocked: false };
  }

  if (sqlite) {
    const row = sqlite
      .prepare(
        `SELECT weekday_mask, closed_at FROM outbound_weekday_journey WHERE client_key = ? AND phone_match_key = ?`
      )
      .get(clientKey, claimKey);
    if (!row) return { blocked: false };
    if (row.closed_at) return { blocked: true, reason: 'journey_terminal', terminal: true };
    const mask = Number(row.weekday_mask || 0);
    if (dayBit && (mask & dayBit) !== 0) {
      return { blocked: true, reason: 'weekday_slot_used', terminal: false };
    }
    return { blocked: false };
  }

  const { rows } = await query(
    `SELECT weekday_mask, closed_at FROM outbound_weekday_journey WHERE client_key = $1 AND phone_match_key = $2 LIMIT 1`,
    [clientKey, claimKey]
  );
  const row = rows[0];
  if (!row) return { blocked: false };
  if (row.closed_at) return { blocked: true, reason: 'journey_terminal', terminal: true };
  const mask = Number(row.weekday_mask || 0);
  if (dayBit && (mask & dayBit) !== 0) return { blocked: true, reason: 'weekday_slot_used', terminal: false };
  return { blocked: false };
}

/**
 * Reserve one outbound attempt for this tenant's local weekday bucket (Mon–Fri, tenant timezone).
 * Terminal journeys (live pickup or all five buckets used without pickup) reject further claims.
 * @param {{ asOf?: Date }} [opts] Optional clock for tests (Mon–Fri in `timezone`).
 * @returns {Promise<{ ok: boolean, reason?: string, closedReason?: string }>}
 */
export async function claimOutboundWeekdayJourneySlot(clientKey, leadPhone, timezone = 'Europe/London', opts = {}) {
  if (outboundBypassMultiplePerDay()) {
    return { ok: true, reason: 'bypass_env' };
  }
  const raw = leadPhone != null ? String(leadPhone).trim() : '';
  if (!clientKey || !raw) return { ok: false, reason: 'invalid' };

  const claimKey = outboundDialClaimKeyFromRaw(raw);
  const { DateTime } = await import('luxon');
  const tz = timezone || 'Europe/London';
  const local =
    opts?.asOf instanceof Date && Number.isFinite(opts.asOf.getTime())
      ? DateTime.fromJSDate(opts.asOf, { zone: tz })
      : DateTime.now().setZone(tz);
  const dayBit = tenantLocalWeekdayBitLuxon(local.weekday);
  if (!dayBit) {
    return { ok: false, reason: 'not_weekday' };
  }

  if (dbType !== 'postgres' || !pool) {
    const blocked = await hasOutboundWeekdayJourneyDialBlocked(clientKey, raw, timezone, opts);
    if (blocked.blocked) {
      return {
        ok: false,
        reason: blocked.reason || 'blocked',
        closedReason: blocked.terminal ? blocked.reason : undefined
      };
    }
    if (sqlite) {
      const trans = sqlite.transaction(() => {
        const row = sqlite
          .prepare(
            `SELECT weekday_mask, closed_at, closed_reason FROM outbound_weekday_journey WHERE client_key = ? AND phone_match_key = ?`
          )
          .get(clientKey, claimKey);
        if (row?.closed_at) {
          throw Object.assign(new Error('journey_terminal'), { code: 'journey_terminal', closedReason: row.closed_reason });
        }
        const mask = Number(row?.weekday_mask || 0);
        if (mask & dayBit) {
          throw Object.assign(new Error('weekday_slot_used'), { code: 'weekday_slot_used' });
        }
        const newMask = mask | dayBit;
        const nowIso = new Date().toISOString();
        if (row) {
          const closed = newMask === OUTBOUND_WEEKDAY_FULL_MASK;
          sqlite
            .prepare(
              `UPDATE outbound_weekday_journey SET weekday_mask = ?, closed_at = ?, closed_reason = ?, updated_at = ?
               WHERE client_key = ? AND phone_match_key = ?`
            )
            .run(
              newMask,
              closed ? nowIso : row.closed_at,
              closed ? 'weekdays_exhausted' : row.closed_reason,
              nowIso,
              clientKey,
              claimKey
            );
        } else {
          const closed = newMask === OUTBOUND_WEEKDAY_FULL_MASK;
          sqlite
            .prepare(
              `INSERT INTO outbound_weekday_journey (client_key, phone_match_key, weekday_mask, closed_at, closed_reason, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)`
            )
            .run(
              clientKey,
              claimKey,
              newMask,
              closed ? nowIso : null,
              closed ? 'weekdays_exhausted' : null,
              nowIso,
              nowIso
            );
        }
      });
      try {
        trans();
      } catch (e) {
        if (e?.code === 'journey_terminal') {
          return { ok: false, reason: 'journey_terminal', closedReason: e.closedReason };
        }
        if (e?.code === 'weekday_slot_used') {
          return { ok: false, reason: 'weekday_slot_used' };
        }
        throw e;
      }
      return { ok: true, reason: 'claimed_sqlite' };
    }
    return { ok: false, reason: 'nonpg_no_sqlite' };
  }

  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const h = createHash('sha256').update(`${clientKey}\0${claimKey}\0outbound_weekday_journey\0`).digest();
    const k1 = (h.readUInt32BE(0) & 0x7fffffff) || 1;
    const k2 = (h.readUInt32BE(4) & 0x7fffffff) || 1;
    await c.query('SELECT pg_advisory_xact_lock($1, $2)', [k1, k2]);

    const sel = await c.query(
      `SELECT weekday_mask, closed_at, closed_reason
       FROM outbound_weekday_journey
       WHERE client_key = $1 AND phone_match_key = $2
       FOR UPDATE`,
      [clientKey, claimKey]
    );
    const row0 = sel.rows[0];
    if (row0?.closed_at) {
      await c.query('ROLLBACK');
      return { ok: false, reason: 'journey_terminal', closedReason: row0.closed_reason };
    }
    const mask = Number(row0?.weekday_mask || 0);
    if (mask & dayBit) {
      await c.query('ROLLBACK');
      return { ok: false, reason: 'weekday_slot_used' };
    }
    const newMask = mask | dayBit;
    if (row0) {
      await c.query(
        `
        UPDATE outbound_weekday_journey SET
          weekday_mask = $3::smallint,
          closed_at = CASE WHEN $3::smallint = $4::smallint THEN COALESCE(closed_at, now()) ELSE closed_at END,
          closed_reason = CASE
            WHEN $3::smallint = $4::smallint THEN COALESCE(closed_reason, 'weekdays_exhausted')
            ELSE closed_reason
          END,
          updated_at = now()
        WHERE client_key = $1 AND phone_match_key = $2
        `,
        [clientKey, claimKey, newMask, OUTBOUND_WEEKDAY_FULL_MASK]
      );
    } else {
      await c.query(
        `
        INSERT INTO outbound_weekday_journey (client_key, phone_match_key, weekday_mask, closed_at, closed_reason, updated_at)
        VALUES (
          $1, $2, $3::smallint,
          CASE WHEN $3::smallint = $4::smallint THEN now() ELSE NULL END,
          CASE WHEN $3::smallint = $4::smallint THEN 'weekdays_exhausted' ELSE NULL END,
          now()
        )
        `,
        [clientKey, claimKey, newMask, OUTBOUND_WEEKDAY_FULL_MASK]
      );
    }

    await c.query('COMMIT');
    return { ok: true, reason: 'claimed' };
  } catch (e) {
    try {
      await c.query('ROLLBACK');
    } catch (_) {
      /* ignore */
    }
    throw e;
  } finally {
    c.release();
  }
}

/** After a live human answers an outbound call, stop further automated dials for this journey until manually cleared. */
export async function closeOutboundWeekdayJourneyOnLivePickup(clientKey, leadPhone) {
  const raw = leadPhone != null ? String(leadPhone).trim() : '';
  if (!clientKey || !raw) return;
  const claimKey = outboundDialClaimKeyFromRaw(raw);

  if (dbType === 'postgres' && pool) {
    await pool.query(
      `
      INSERT INTO outbound_weekday_journey (client_key, phone_match_key, weekday_mask, closed_at, closed_reason, updated_at)
      VALUES ($1, $2, 0, now(), 'live_pickup', now())
      ON CONFLICT (client_key, phone_match_key) DO UPDATE SET
        closed_at = COALESCE(outbound_weekday_journey.closed_at, now()),
        closed_reason = CASE
          WHEN outbound_weekday_journey.closed_reason IS NOT NULL THEN outbound_weekday_journey.closed_reason
          ELSE 'live_pickup'
        END,
        updated_at = now()
      `,
      [clientKey, claimKey]
    );
    return;
  }

  if (sqlite) {
    const nowIso = new Date().toISOString();
    const row = sqlite
      .prepare(`SELECT closed_at, closed_reason FROM outbound_weekday_journey WHERE client_key = ? AND phone_match_key = ?`)
      .get(clientKey, claimKey);
    if (row) {
      sqlite
        .prepare(
          `UPDATE outbound_weekday_journey SET
            closed_at = COALESCE(closed_at, ?),
            closed_reason = COALESCE(closed_reason, 'live_pickup'),
            updated_at = ?
          WHERE client_key = ? AND phone_match_key = ?`
        )
        .run(nowIso, nowIso, clientKey, claimKey);
    } else {
      sqlite
        .prepare(
          `INSERT INTO outbound_weekday_journey (client_key, phone_match_key, weekday_mask, closed_at, closed_reason, created_at, updated_at)
           VALUES (?, ?, 0, ?, 'live_pickup', ?, ?)`
        )
        .run(clientKey, claimKey, nowIso, nowIso, nowIso);
    }
  }
}

/** Legacy name: true when weekday journey blocks another dial right now (terminal or today's bucket used). */
export async function hasOutboundCallAttemptToday(clientKey, leadPhone, timezone = 'Europe/London', opts = {}) {
  const r = await hasOutboundWeekdayJourneyDialBlocked(clientKey, leadPhone, timezone, opts);
  return r.blocked;
}

/** Legacy name: reserve Mon–Fri weekday bucket (see claimOutboundWeekdayJourneySlot). */
export async function claimOutboundDialSlotForToday(clientKey, leadPhone, timezone = 'Europe/London', opts = {}) {
  return claimOutboundWeekdayJourneySlot(clientKey, leadPhone, timezone, opts);
}

export async function getCallsByTenant(clientKey, limit = 100) {
  const { rows } = await query(`
    SELECT
      id, call_id, client_key, lead_phone, status, outcome, duration, cost,
      metadata, retry_attempt,
      LEFT(COALESCE(transcript, ''), 512) AS transcript,
      recording_url, sentiment, quality_score, objections, key_phrases, metrics,
      analyzed_at, created_at, updated_at
    FROM calls
    WHERE client_key = $1
    ORDER BY created_at DESC
    LIMIT $2
  `, [clientKey, limit]);
  return rows;
}

export async function upsertCallInsights({ clientKey, periodDays = 30, insights, routing = null, computedAt = null }) {
  const insightsJson = insights ? JSON.stringify(insights) : JSON.stringify({});
  const routingJson = routing ? JSON.stringify(routing) : null;
  await query(`
    INSERT INTO call_insights (client_key, period_days, insights, routing, computed_at, updated_at)
    VALUES ($1, $2, $3::jsonb, $4::jsonb, COALESCE($5::timestamptz, now()), now())
    ON CONFLICT (client_key)
    DO UPDATE SET
      period_days = EXCLUDED.period_days,
      insights = EXCLUDED.insights,
      routing = EXCLUDED.routing,
      computed_at = EXCLUDED.computed_at,
      updated_at = now()
  `, [clientKey, periodDays, insightsJson, routingJson, computedAt]);
}

export async function getLatestCallInsights(clientKey) {
  const { rows } = await query(`
    SELECT client_key, period_days, insights, routing, computed_at
    FROM call_insights
    WHERE client_key = $1
    LIMIT 1
  `, [clientKey]);
  return rows?.[0] || null;
}

let _callAnalyticsFloorIsoCache = null;

/**
 * Earliest call.created_at included in bandit + insights + call-quality windows.
 * Persists `floor_at` in DB (set on first init); optional env CALL_ANALYTICS_SINCE overrides.
 */
export async function getCallAnalyticsFloorIso() {
  const envIso = getCallAnalyticsEnvOverrideIso();
  if (envIso) return envIso;
  if (_callAnalyticsFloorIsoCache) return _callAnalyticsFloorIsoCache;

  try {
    const DEFAULT_FLOOR_DAYS = 365;
    if (dbType === 'postgres' && pool) {
      await query(`
        INSERT INTO call_analytics_floor (id, floor_at)
        VALUES (1, now() - INTERVAL '${DEFAULT_FLOOR_DAYS} days')
        ON CONFLICT (id) DO NOTHING
      `);
    } else if (sqlite) {
      await query(
        `INSERT OR IGNORE INTO call_analytics_floor (id, floor_at) VALUES (1, datetime('now'))`
      );
    } else {
      _callAnalyticsFloorIsoCache = new Date().toISOString();
      return _callAnalyticsFloorIsoCache;
    }
    const { rows } = await query(`SELECT floor_at FROM call_analytics_floor WHERE id = 1`);
    const t = rows?.[0]?.floor_at;

    // If the floor was initialized too recently (e.g. first boot), widen it so analytics/learning
    // can see meaningful history. This is idempotent and only ever moves the floor earlier.
    if (dbType === 'postgres' && pool && t) {
      const floorMs = new Date(t).getTime();
      const minMs = Date.now() - DEFAULT_FLOOR_DAYS * 86400000;
      if (Number.isFinite(floorMs) && floorMs > minMs) {
        await query(
          `UPDATE call_analytics_floor SET floor_at = NOW() - INTERVAL '${DEFAULT_FLOOR_DAYS} days' WHERE id = 1`
        );
        const { rows: rr } = await query(`SELECT floor_at FROM call_analytics_floor WHERE id = 1`);
        const tt = rr?.[0]?.floor_at;
        _callAnalyticsFloorIsoCache = tt ? new Date(tt).toISOString() : new Date().toISOString();
        return _callAnalyticsFloorIsoCache;
      }
    }
    _callAnalyticsFloorIsoCache = t
      ? new Date(t).toISOString()
      : new Date().toISOString();
  } catch (e) {
    console.warn('[call_analytics_floor]', e.message);
    _callAnalyticsFloorIsoCache = new Date().toISOString();
  }
  return _callAnalyticsFloorIsoCache;
}

/**
 * Recompute stored Beta arms from observations tied to calls on/after the analytics floor.
 */
async function rebuildCallTimeBanditArmsForCutoff(clientKey) {
  const minIso = await getCallAnalyticsFloorIso();
  if (!clientKey) return;
  const { rows } = await query(
    `
    SELECT o.hour AS hour, o.success AS success
    FROM call_time_bandit_observations o
    INNER JOIN calls c ON c.call_id = o.call_id AND c.client_key = o.client_key
    WHERE o.client_key = $1 AND c.created_at >= $2::timestamptz
  `,
    [clientKey, minIso]
  );
  const arms = {};
  for (let h = 0; h < 24; h++) {
    arms[String(h)] = { a: 1, b: 1 };
  }
  for (const r of rows || []) {
    const hourNum = Number(r.hour);
    if (!Number.isFinite(hourNum)) continue;
    const hk = String(hourNum);
    const prev = arms[hk] || { a: 1, b: 1 };
    const a = Number(prev.a) || 1;
    const b = Number(prev.b) || 1;
    const success = r.success === true || r.success === 1 || r.success === 'true';
    arms[hk] = success ? { a: a + 1, b } : { a, b: b + 1 };
  }
  await query(
    `
    INSERT INTO call_time_bandit (client_key, arms, updated_at)
    VALUES ($1, $2::jsonb, now())
    ON CONFLICT (client_key)
    DO UPDATE SET arms = EXCLUDED.arms, updated_at = now()
  `,
    [clientKey, JSON.stringify(arms)]
  );
}

/** Limit full recomputes on hot dashboard polling (floor is always on). */
const _banditCutoffRebuildLastMs = new Map();
const BANDIT_CUTOFF_DASHBOARD_REBUILD_MS = 60_000;

async function maybeRebuildBanditArmsForCutoffThrottled(clientKey) {
  if (!clientKey) return;
  await getCallAnalyticsFloorIso();
  const now = Date.now();
  const last = _banditCutoffRebuildLastMs.get(clientKey) || 0;
  if (now - last < BANDIT_CUTOFF_DASHBOARD_REBUILD_MS) return;
  _banditCutoffRebuildLastMs.set(clientKey, now);
  await rebuildCallTimeBanditArmsForCutoff(clientKey);
}

export async function getCallTimeBanditState(clientKey) {
  try {
    const { rows } = await poolQuerySelect(`
      SELECT arms FROM call_time_bandit WHERE client_key = $1
    `, [clientKey]);
    const arms = rows?.[0]?.arms;
    if (arms == null) return {};
    if (typeof arms === 'object') return { ...arms };
    return {};
  } catch (e) {
    console.warn('[CALL TIME BANDIT] getCallTimeBanditState:', e.message);
    return {};
  }
}

/**
 * Dashboard payload: Beta posteriors per clock hour (tenant-local) for Thompson dial-time learning.
 */
export async function getCallTimeBanditForDashboard(clientKey) {
  const empty = {
    ok: true,
    updatedAt: null,
    observationCount: 0,
    observationsLast7Days: 0,
    hours: [],
    ranked: [],
    recentActivity: [],
    scheduleAdjustments: []
  };
  if (!clientKey) return { ...empty, ok: false, error: 'missing client' };

  try {
    await maybeRebuildBanditArmsForCutoffThrottled(clientKey);
    const minIso = await getCallAnalyticsFloorIso();

    const [{ rows: br }, { rows: cr }] = await Promise.all([
      poolQuerySelect(
        `SELECT arms, updated_at FROM call_time_bandit WHERE client_key = $1`,
        [clientKey]
      ),
      poolQuerySelect(
        `
        SELECT COUNT(*) AS c
        FROM call_time_bandit_observations o
        INNER JOIN calls c ON c.call_id = o.call_id AND c.client_key = o.client_key
        WHERE o.client_key = $1 AND c.created_at >= $2::timestamptz
      `,
        [clientKey, minIso]
      )
    ]);

    const observationCount = parseInt(String(cr?.[0]?.c ?? 0), 10) || 0;
    const updatedAt = br?.[0]?.updated_at
      ? new Date(br[0].updated_at).toISOString()
      : null;
    const raw = br?.[0]?.arms;
    const arms =
      raw != null && typeof raw === 'object' && !Array.isArray(raw) ? { ...raw } : {};

    const hours = [];
    for (let h = 0; h < 24; h++) {
      const hk = String(h);
      const prev = arms[hk] || { a: 1, b: 1 };
      const a = Number(prev.a) || 1;
      const b = Number(prev.b) || 1;
      const ab = a + b;
      const mean = ab > 0 ? a / ab : 0.5;
      const successes = Math.max(0, Math.round(a - 1));
      const failures = Math.max(0, Math.round(b - 1));
      const observations = successes + failures;
      const varBeta = ab > 0 ? (a * b) / (ab * ab * (ab + 1)) : 0.25;
      const uncertainty = Math.min(50, Math.round(100 * Math.sqrt(varBeta)));
      let strength = 'prior';
      if (observations >= 40) strength = 'strong';
      else if (observations >= 8) strength = 'building';
      else if (observations >= 1) strength = 'early';

      hours.push({
        hour: h,
        label: `${String(h).padStart(2, '0')}:00`,
        alpha: a,
        beta: b,
        meanAnsweredPct: Math.round(mean * 100),
        successes,
        failures,
        observations,
        uncertainty,
        strength
      });
    }

    const ranked = [...hours]
      .filter((x) => x.observations > 0)
      .sort((x, y) => y.meanAnsweredPct - x.meanAnsweredPct || y.observations - x.observations)
      .slice(0, 12);

    const [{ rows: recentObs }, { rows: recentSched }, { rows: c7 }] = await Promise.all([
      poolQuerySelect(
        `
        SELECT o.call_id, o.hour, o.success, o.created_at
        FROM call_time_bandit_observations o
        INNER JOIN calls c ON c.call_id = o.call_id AND c.client_key = o.client_key
        WHERE o.client_key = $1 AND c.created_at >= $2::timestamptz
        ORDER BY o.created_at DESC
        LIMIT 40
      `,
        [clientKey, minIso]
      ),
      poolQuerySelect(
        `
        SELECT baseline_at, chosen_at, source, hour_chosen, delay_minutes, created_at
        FROM call_schedule_decisions
        WHERE client_key = $1 AND created_at >= $2::timestamptz
        ORDER BY created_at DESC
        LIMIT 30
      `,
        [clientKey, minIso]
      ),
      poolQuerySelect(
        `
        SELECT COUNT(*) AS c
        FROM call_time_bandit_observations o
        INNER JOIN calls c ON c.call_id = o.call_id AND c.client_key = o.client_key
        WHERE o.client_key = $1
          AND c.created_at >= $2::timestamptz
          AND c.created_at >= NOW() - INTERVAL '7 days'
      `,
        [clientKey, minIso]
      )
    ]);

    const observationsLast7Days = parseInt(String(c7?.[0]?.c ?? 0), 10) || 0;
    const recentActivity = (recentObs || []).map((r) => ({
      callId: r.call_id,
      hour: r.hour,
      success: Boolean(r.success),
      at: r.created_at ? new Date(r.created_at).toISOString() : null
    }));
    const scheduleAdjustments = (recentSched || []).map((r) => ({
      baselineAt: r.baseline_at ? new Date(r.baseline_at).toISOString() : null,
      chosenAt: r.chosen_at ? new Date(r.chosen_at).toISOString() : null,
      source: r.source,
      hourChosen: r.hour_chosen,
      delayMinutes: r.delay_minutes,
      at: r.created_at ? new Date(r.created_at).toISOString() : null
    }));

    return {
      ok: true,
      updatedAt,
      observationCount,
      observationsLast7Days,
      hours,
      ranked,
      recentActivity,
      scheduleAdjustments
    };
  } catch (e) {
    console.warn('[CALL TIME BANDIT] getCallTimeBanditForDashboard:', e.message);
    return {
      ...empty,
      ok: false,
      error: e.message,
      recentActivity: [],
      scheduleAdjustments: [],
      observationsLast7Days: 0
    };
  }
}

function isBanditEligibleCallRow(row) {
  const st = (row.status || '').toString().trim().toLowerCase();
  if (['initiated', 'in_progress', 'queued', 'pending', 'ringing'].includes(st)) return false;
  const dur = row.duration != null ? Number(row.duration) : null;
  const hasOutcome = row.outcome != null && String(row.outcome).trim() !== '';
  if (!hasOutcome && (dur == null || dur === 0) && !['ended', 'completed', 'finished', 'failed'].includes(st)) {
    return false;
  }
  return true;
}

/**
 * Populate bandit observations from historical calls missing from call_time_bandit_observations.
 * Merges posteriors in one write. Safe to run repeatedly.
 */
export async function backfillCallTimeBanditObservations(clientKey, { days = 30, limit = 4000 } = {}) {
  if (!clientKey) return { inserted: 0, skipped: true };
  try {
    const minIso = await getCallAnalyticsFloorIso();
    await rebuildCallTimeBanditArmsForCutoff(clientKey);

    const tenant = await getFullClient(clientKey);
    if (!tenant) return { inserted: 0 };

    const { getTenantTimezone } = await import('./lib/business-hours.js');
    const { DateTime } = await import('luxon');
    const { isAnsweredHeuristic } = await import('./lib/call-outcome-heuristics.js');

    const tz = getTenantTimezone(tenant, process.env.TZ || process.env.TIMEZONE || 'Europe/London');
    const d = Math.max(1, Math.min(120, Number(days) || 30));
    const lim = Math.max(1, Math.min(8000, Number(limit) || 4000));

    const { rows } = await query(
      `
      SELECT c.call_id, c.created_at, c.outcome, c.status, c.duration,
             LEFT(COALESCE(c.transcript, ''), 512) AS transcript, c.recording_url
      FROM calls c
      WHERE c.client_key = $1
        AND c.created_at >= NOW() - ($2::integer * INTERVAL '1 day')
        AND c.created_at >= $4::timestamptz
        AND NOT EXISTS (
          SELECT 1 FROM call_time_bandit_observations o WHERE o.call_id = c.call_id
        )
      ORDER BY c.created_at ASC
      LIMIT $3
    `,
      [clientKey, d, lim, minIso]
    );

    const arms = { ...(await getCallTimeBanditState(clientKey)) };
    const toInsert = [];

    for (const row of rows || []) {
      if (!row?.call_id || !row.created_at) continue;
      if (!isBanditEligibleCallRow(row)) continue;
      const dt = DateTime.fromJSDate(new Date(row.created_at), { zone: tz });
      if (!dt.isValid) continue;
      const hour = dt.hour;
      const success = isAnsweredHeuristic(row);
      toInsert.push({
        call_id: String(row.call_id),
        client_key: clientKey,
        hour,
        success
      });
      const hk = String(hour);
      const prev = arms[hk] || { a: 1, b: 1 };
      const a = Number(prev.a) || 1;
      const b = Number(prev.b) || 1;
      arms[hk] = success ? { a: a + 1, b } : { a, b: b + 1 };
    }

    if (toInsert.length === 0) return { inserted: 0 };

    const chunkSize = 80;
    for (let i = 0; i < toInsert.length; i += chunkSize) {
      const chunk = toInsert.slice(i, i + chunkSize);
      const placeholders = chunk
        .map((_, j) => {
          const o = j * 4;
          return `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4})`;
        })
        .join(', ');
      const flat = chunk.flatMap((x) => [x.call_id, x.client_key, x.hour, x.success]);
      await query(
        `
        INSERT INTO call_time_bandit_observations (call_id, client_key, hour, success)
        VALUES ${placeholders}
        ON CONFLICT (call_id) DO NOTHING
      `,
        flat
      );
    }

    await query(
      `
      INSERT INTO call_time_bandit (client_key, arms, updated_at)
      VALUES ($1, $2::jsonb, now())
      ON CONFLICT (client_key)
      DO UPDATE SET arms = EXCLUDED.arms, updated_at = now()
    `,
      [clientKey, JSON.stringify(arms)]
    );

    return { inserted: toInsert.length };
  } catch (e) {
    console.warn('[CALL TIME BANDIT] backfill:', e.message);
    return { inserted: 0, error: e.message };
  }
}

export async function recordCallScheduleDecision({
  clientKey,
  baselineAt,
  chosenAt,
  source,
  hourChosen,
  delayMinutes
}) {
  if (!clientKey || !baselineAt || !chosenAt || !source) return;
  try {
    await query(
      `
      INSERT INTO call_schedule_decisions
        (client_key, baseline_at, chosen_at, source, hour_chosen, delay_minutes)
      VALUES ($1, $2::timestamptz, $3::timestamptz, $4, $5, $6)
    `,
      [
        clientKey,
        baselineAt instanceof Date ? baselineAt.toISOString() : baselineAt,
        chosenAt instanceof Date ? chosenAt.toISOString() : chosenAt,
        String(source),
        hourChosen != null ? Number(hourChosen) : null,
        delayMinutes != null ? Number(delayMinutes) : null
      ]
    );
  } catch (e) {
    console.warn('[CALL SCHEDULE] log skipped:', e.message);
  }
}

async function mergeCallTimeBanditPosterior(clientKey, hour, success) {
  const hk = String(hour);
  const curState = await getCallTimeBanditState(clientKey);
  const arms = { ...curState };
  const prev = arms[hk] || { a: 1, b: 1 };
  const a = Number(prev.a) || 1;
  const b = Number(prev.b) || 1;
  arms[hk] = success ? { a: a + 1, b } : { a, b: b + 1 };
  await query(`
    INSERT INTO call_time_bandit (client_key, arms, updated_at)
    VALUES ($1, $2::jsonb, now())
    ON CONFLICT (client_key)
    DO UPDATE SET arms = EXCLUDED.arms, updated_at = now()
  `, [clientKey, JSON.stringify(arms)]);
}

/**
 * Idempotent: one bandit update per call_id. Uses call created_at hour in tenant TZ; label = answered heuristic.
 */
export async function recordCallTimeBanditAfterCallComplete({ clientKey, callId }) {
  if (!clientKey || !callId) return;
  try {
    const { rows } = await query(`
      SELECT call_id, created_at, outcome, status, duration, transcript, recording_url
      FROM calls
      WHERE call_id = $1 AND client_key = $2
    `, [callId, clientKey]);
    const row = rows?.[0];
    if (!row?.created_at) return;

    const minIso = await getCallAnalyticsFloorIso();
    if (new Date(row.created_at).getTime() < new Date(minIso).getTime()) {
      return;
    }

    const st = (row.status || '').toString().trim().toLowerCase();
    if (['initiated', 'in_progress', 'queued', 'pending', 'ringing'].includes(st)) return;
    const dur = row.duration != null ? Number(row.duration) : null;
    const hasOutcome = row.outcome != null && String(row.outcome).trim() !== '';
    if (!hasOutcome && (dur == null || dur === 0) && !['ended', 'completed', 'finished', 'failed'].includes(st)) {
      return;
    }

    const tenant = await getFullClient(clientKey);
    if (!tenant) return;

    const { getTenantTimezone } = await import('./lib/business-hours.js');
    const { DateTime } = await import('luxon');
    const { isAnsweredHeuristic } = await import('./lib/call-outcome-heuristics.js');

    const tz = getTenantTimezone(tenant, process.env.TZ || process.env.TIMEZONE || 'Europe/London');
    const dt = DateTime.fromJSDate(new Date(row.created_at), { zone: tz });
    if (!dt.isValid) return;
    const hour = dt.hour;
    const success = isAnsweredHeuristic(row);

    await rebuildCallTimeBanditArmsForCutoff(clientKey);

    const ins = await query(`
      INSERT INTO call_time_bandit_observations (call_id, client_key, hour, success)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (call_id) DO NOTHING
      RETURNING call_id
    `, [callId, clientKey, hour, success]);

    if (ins.rows?.length) {
      await mergeCallTimeBanditPosterior(clientKey, hour, success);
    }
  } catch (e) {
    console.warn('[CALL TIME BANDIT] record skipped:', e.message);
  }
}

export async function getCallsByPhone(clientKey, leadPhone, limit = 50) {
  const { rows } = await query(`
    SELECT
      id, call_id, client_key, lead_phone, status, outcome, duration, cost,
      metadata, retry_attempt,
      LEFT(COALESCE(transcript, ''), 512) AS transcript,
      recording_url, sentiment, quality_score, objections, key_phrases, metrics,
      analyzed_at, created_at, updated_at
    FROM calls
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

// Get quality metrics for a client
export async function getCallQualityMetrics(clientKey, days = 30) {
  const dayMs = Math.max(1, Number(days) || 30) * 86400000;
  let sinceMs = Date.now() - dayMs;
  const minIso = await getCallAnalyticsFloorIso();
  const t = new Date(minIso).getTime();
  if (t > sinceMs) sinceMs = t;
  const since = new Date(sinceMs).toISOString();
  const { rows } = await query(`
    SELECT 
      COUNT(*) as total_calls,
      COUNT(*) FILTER (WHERE status = 'completed') as successful_calls,
      COUNT(*) FILTER (WHERE outcome = 'booked') as bookings,
      AVG(quality_score) as avg_quality_score,
      AVG(duration) as avg_duration,
      COUNT(*) FILTER (WHERE sentiment = 'positive') as positive_sentiment_count,
      COUNT(*) FILTER (WHERE sentiment = 'negative') as negative_sentiment_count,
      COUNT(*) FILTER (WHERE sentiment = 'neutral') as neutral_sentiment_count
    FROM calls
    WHERE client_key = $1 
      AND created_at >= $2::timestamptz
      AND quality_score IS NOT NULL
  `, [clientKey, since]);
  
  return rows[0] || {
    total_calls: 0,
    successful_calls: 0,
    bookings: 0,
    avg_quality_score: 0,
    avg_duration: 0,
    positive_sentiment_count: 0,
    negative_sentiment_count: 0,
    neutral_sentiment_count: 0
  };
}

// Get quality alerts for a client
export async function getQualityAlerts(clientKey, options = {}) {
  const { resolved = false, limit = 50 } = options;
  
  const { rows } = await query(`
    SELECT * FROM quality_alerts
    WHERE client_key = $1 
      AND resolved = $2
    ORDER BY created_at DESC
    LIMIT $3
  `, [clientKey, resolved, limit]);
  
  return rows || [];
}

// Resolve a quality alert
export async function resolveQualityAlert(alertId) {
  await query(`
    UPDATE quality_alerts
    SET resolved = TRUE, resolved_at = NOW()
    WHERE id = $1
  `, [alertId]);
}

// Store quality alert
export async function storeQualityAlert({ clientKey, alertType, severity, metric, actualValue, expectedValue, message, action, impact, metadata }) {
  const metadataJson = metadata ? JSON.stringify(metadata) : null;
  
  await query(`
    INSERT INTO quality_alerts (
      client_key, alert_type, severity, metric, actual_value, expected_value,
      message, action, impact, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  `, [clientKey, alertType, severity, metric, actualValue, expectedValue, message, action, impact, metadataJson]);
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
      AND retry_type = 'vapi_call'
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

export async function cancelPendingRetries(clientKey, leadPhone) {
  await query(`
    UPDATE retry_queue 
    SET status = 'cancelled', updated_at = now()
    WHERE client_key = $1 AND lead_phone = $2 AND status = 'pending'
  `, [clientKey, leadPhone]);
  
  console.log(`[DB] Cancelled pending retries for ${leadPhone} (${clientKey})`);
}

/** Cancels only automated follow-up rows (not technical vapi_call retries). */
export async function cancelPendingFollowUps(clientKey, leadPhone) {
  await query(`
    UPDATE retry_queue 
    SET status = 'cancelled', updated_at = now()
    WHERE client_key = $1 AND lead_phone = $2 AND status = 'pending'
      AND retry_reason LIKE 'follow\\_up\\_%' ESCAPE '\\'
  `, [clientKey, leadPhone]);
}

export async function cleanupOldRetries(daysOld = 7) {
  await query(`
    DELETE FROM retry_queue 
    WHERE created_at < now() - interval '${daysOld} days'
    AND status IN ('completed', 'failed', 'cancelled')
  `);
}

// Call queue functions
// --- V1: hard block outbound calls to opted-out numbers (DNC)
let optedOutDialCache = null;
let optedOutDialCacheLoadedAt = 0;
const OPTED_OUT_DIAL_CACHE_TTL_MS = 5 * 60 * 1000;

async function loadOptedOutDialCache() {
  const now = Date.now();
  if (optedOutDialCache && (now - optedOutDialCacheLoadedAt) < OPTED_OUT_DIAL_CACHE_TTL_MS) return optedOutDialCache;
  try {
    const activePhones = await query(
      dbType === 'sqlite'
        ? `SELECT phone FROM opt_out_list WHERE active = 1`
        : `SELECT phone FROM opt_out_list WHERE active = TRUE`
    );
    const set = new Set();
    for (const r of activePhones.rows || []) {
      const raw = String(r.phone || '').trim();
      const mk = phoneMatchKey(raw);
      if (mk) set.add(mk);
    }
    optedOutDialCache = set;
    optedOutDialCacheLoadedAt = now;
    return optedOutDialCache;
  } catch (e) {
    // If opt_out_list doesn't exist (new env), fail open (don't block calls).
    // Lead import path still checks opted_out elsewhere.
    return optedOutDialCache || new Set();
  }
}

async function isOptedOutForDial(leadPhone) {
  const mk = phoneMatchKey(leadPhone);
  if (!mk) return false;
  const set = await loadOptedOutDialCache();
  return set.has(mk);
}

export function invalidateOptOutDialCache() {
  optedOutDialCache = null;
  optedOutDialCacheLoadedAt = 0;
}

export async function listOptOutList({ q = '', activeOnly = true, limit = 100, offset = 0 } = {}) {
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);
  const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);
  const qq = String(q || '').trim();
  const where = [];
  const params = [];

  if (activeOnly) where.push(dbType === 'sqlite' ? `active = 1` : `active = TRUE`);
  if (qq) {
    params.push(`%${qq}%`);
    where.push(dbType === 'postgres' ? `phone ILIKE $${params.length}` : `phone LIKE $${params.length}`);
  }

  params.push(safeLimit);
  params.push(safeOffset);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sql = `
    SELECT id, phone, reason, notes, active, opted_out_at, updated_at
    FROM opt_out_list
    ${whereSql}
    ORDER BY updated_at DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;
  const result = await query(sql, params);
  return result.rows || [];
}

export async function upsertOptOut({ phone, reason = 'user_request', notes = null } = {}) {
  const raw = String(phone || '').trim();
  const normalized = normalizePhoneE164(raw, 'GB') || raw;
  if (!normalized || !/^\+\d{7,15}$/.test(normalized)) {
    const err = new Error('invalid_phone');
    err.code = 'invalid_phone';
    throw err;
  }
  const r = String(reason || '').trim() || 'user_request';
  const n = notes == null ? null : String(notes).trim();

  await query(
    `
    INSERT INTO opt_out_list (phone, reason, notes, opted_out_at, active, updated_at)
    VALUES ($1, $2, $3, NOW(), ${dbType === 'sqlite' ? 1 : 'TRUE'}, NOW())
    ON CONFLICT (phone)
    DO UPDATE SET active = ${dbType === 'sqlite' ? 1 : 'TRUE'}, reason = $2, notes = $3, opted_out_at = NOW(), updated_at = NOW()
    `,
    [normalized, r, n]
  );
  invalidateOptOutDialCache();
  return { phone: normalized };
}

export async function deactivateOptOut({ phone } = {}) {
  const raw = String(phone || '').trim();
  const normalized = normalizePhoneE164(raw, 'GB') || raw;
  if (!normalized || !/^\+\d{7,15}$/.test(normalized)) {
    const err = new Error('invalid_phone');
    err.code = 'invalid_phone';
    throw err;
  }
  await query(
    `
    UPDATE opt_out_list
    SET active = ${dbType === 'sqlite' ? 0 : 'FALSE'}, updated_at = NOW()
    WHERE phone = $1
    `,
    [normalized]
  );
  invalidateOptOutDialCache();
  return { phone: normalized };
}

/** Break exact .000s timestamps so many rows never share the same instant (ops top-of-hour + dial spread). */
export function smearCallQueueScheduledFor(scheduledFor, clientKey, leadPhone, queueRowId = null) {
  const t = scheduledFor instanceof Date ? new Date(scheduledFor.getTime()) : new Date(scheduledFor);
  if (Number.isNaN(t.getTime())) return t;
  const ms = t.getTime();
  if (ms % 1000 !== 0) return t;
  let h = 0x811c9dc5;
  const s = `${clientKey}\0${leadPhone ?? ''}\0${queueRowId != null ? String(queueRowId) : ''}\0${ms}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const extra = 1 + ((h >>> 0) % 998);
  return new Date(ms + extra);
}

export async function addToCallQueue({ clientKey, leadPhone, priority = 5, scheduledFor, callType, callData }) {
  const callDataJson = callData ? JSON.stringify(callData) : null;
  const when =
    callType === 'vapi_call'
      ? smearCallQueueScheduledFor(scheduledFor, clientKey, leadPhone ?? '', null)
      : scheduledFor instanceof Date
        ? scheduledFor
        : scheduledFor;

  if (callType === 'vapi_call') {
    // V1 compliance: never enqueue outbound dials for opted-out numbers.
    if (await isOptedOutForDial(leadPhone)) {
      const err = new Error('opted_out');
      err.code = 'opted_out';
      err.clientKey = clientKey;
      err.leadPhone = leadPhone;
      throw err;
    }
    const raw = String(leadPhone ?? '').trim();
    const matchKey = outboundDialClaimKeyFromRaw(raw);
    const weakDigits = matchKey === '__nodigits__';

    if (dbType === 'postgres' && pool) {
      const keySql = pgQueueLeadPhoneKeyExpr('lead_phone');
      const sel = await query(
        weakDigits
          ? `
        SELECT id, scheduled_for, priority
        FROM call_queue
        WHERE client_key = $1
          AND status IN ('pending', 'processing')
          AND call_type = 'vapi_call'
          AND lead_phone = $2
        ORDER BY scheduled_for ASC, priority ASC, id ASC
        LIMIT 1
        `
          : `
        SELECT id, scheduled_for, priority
        FROM call_queue
        WHERE client_key = $1
          AND status IN ('pending', 'processing')
          AND call_type = 'vapi_call'
          AND (${keySql}) = $2
        ORDER BY scheduled_for ASC, priority ASC, id ASC
        LIMIT 1
        `,
        weakDigits ? [clientKey, raw] : [clientKey, matchKey]
      );
      const ex = sel.rows?.[0];
      if (ex) {
        const exTime = new Date(ex.scheduled_for).getTime();
        const newTime = when instanceof Date ? when.getTime() : new Date(when).getTime();
        const earlier = newTime < exTime;
        const betterPriority = priority < Number(ex.priority);
        if (earlier || betterPriority) {
          const nextWhen = earlier
            ? smearCallQueueScheduledFor(when instanceof Date ? when : new Date(when), clientKey, raw, ex.id)
            : ex.scheduled_for;
          const nextPri = betterPriority ? priority : ex.priority;
          await query(
            `UPDATE call_queue SET scheduled_for = $1, priority = $2, updated_at = now() WHERE id = $3`,
            [nextWhen, nextPri, ex.id]
          );
        }
        const { rows: out } = await query(`SELECT * FROM call_queue WHERE id = $1`, [ex.id]);
        return out[0];
      }
    } else if (sqlite) {
      const rowsSqlite = sqlite
        .prepare(
          `SELECT id, scheduled_for, priority, lead_phone FROM call_queue
           WHERE client_key = ? AND call_type = 'vapi_call' AND status IN ('pending','processing')`
        )
        .all(clientKey);
      const ex = (rowsSqlite || []).find((r) =>
        weakDigits ? String(r.lead_phone || '').trim() === raw : outboundDialClaimKeyFromRaw(r.lead_phone) === matchKey
      );
      if (ex) {
        const exTime = new Date(ex.scheduled_for).getTime();
        const newTime = when instanceof Date ? when.getTime() : new Date(when).getTime();
        const earlier = newTime < exTime;
        const betterPriority = priority < Number(ex.priority);
        if (earlier || betterPriority) {
          const nextWhen = earlier
            ? smearCallQueueScheduledFor(when instanceof Date ? when : new Date(when), clientKey, raw, ex.id)
            : ex.scheduled_for;
          const nextPri = betterPriority ? priority : ex.priority;
          sqlite.prepare(`UPDATE call_queue SET scheduled_for = ?, priority = ?, updated_at = datetime('now') WHERE id = ?`).run(
            nextWhen instanceof Date ? nextWhen.toISOString() : nextWhen,
            nextPri,
            ex.id
          );
        }
        return sqlite.prepare(`SELECT * FROM call_queue WHERE id = ?`).get(ex.id);
      }
    }
  }

  const { rows } = await query(
    `
    INSERT INTO call_queue (client_key, lead_phone, priority, scheduled_for, call_type, call_data, status)
    VALUES ($1, $2, $3, $4, $5, $6, 'pending')
    RETURNING *
    `,
    [clientKey, leadPhone, priority, when, callType, callDataJson]
  );

  return rows[0];
}

export async function getPendingCalls(limit = 100) {
  // Order by time first so the planner can use (scheduled_for, priority) on pending rows and stop at LIMIT.
  // Priority-first ordering would scan huge "future high-priority" prefixes before due low-priority work (multi-second).
  const { rows } = await query(`
    SELECT * FROM call_queue 
    WHERE status = 'pending'
      AND call_type = 'vapi_call'
      AND scheduled_for <= now()
    ORDER BY scheduled_for ASC, priority ASC
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

/** Cancel all other pending queue rows for the same client + dialable phone identity (tail-10 / digit key). */
export async function cancelDuplicatePendingCalls(clientKey, leadPhone, excludeId) {
  const raw = leadPhone != null ? String(leadPhone).trim() : '';
  const matchKey = outboundDialClaimKeyFromRaw(raw);
  const weakDigits = matchKey === '__nodigits__';
  if (sqlite) {
    const rows = sqlite
      .prepare(
        `SELECT id, lead_phone FROM call_queue
         WHERE client_key = ? AND status = 'pending' AND id != ? AND call_type = 'vapi_call'`
      )
      .all(clientKey, excludeId);
    let n = 0;
    for (const r of rows || []) {
      const same = weakDigits
        ? String(r.lead_phone || '').trim() === raw
        : outboundDialClaimKeyFromRaw(r.lead_phone) === matchKey;
      if (same) {
        sqlite.prepare(`UPDATE call_queue SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?`).run(r.id);
        n++;
      }
    }
    return n;
  }
  const keySql = pgQueueLeadPhoneKeyExpr('lead_phone');
  const result = await query(
    weakDigits
      ? `
    UPDATE call_queue
    SET status = 'cancelled', updated_at = now()
    WHERE client_key = $1
      AND status = 'pending'
      AND id != $2
      AND call_type = 'vapi_call'
      AND lead_phone = $3
    `
      : `
    UPDATE call_queue
    SET status = 'cancelled', updated_at = now()
    WHERE client_key = $1
      AND status = 'pending'
      AND id != $2
      AND call_type = 'vapi_call'
      AND (${keySql}) = $3
    `,
    weakDigits ? [clientKey, excludeId, raw] : [clientKey, excludeId, matchKey]
  );
  return result?.rowCount ?? result?.changes ?? 0;
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

/** Clear pending call queue rows. Optionally filter by clientKey and/or leadPhone. */
export async function clearCallQueue({ clientKey, leadPhone } = {}) {
  let result;
  if (!clientKey && !leadPhone) {
    result = await query(`DELETE FROM call_queue WHERE status = 'pending'`);
  } else {
    const conditions = ["status = 'pending'"];
    const params = [];
    let i = 1;
    if (clientKey) {
      conditions.push(`client_key = $${i++}`);
      params.push(clientKey);
    }
    if (leadPhone) {
      conditions.push(`lead_phone = $${i++}`);
      params.push(leadPhone);
    }
    result = await query(
      `DELETE FROM call_queue WHERE ${conditions.join(' AND ')}`,
      params
    );
  }
  return result?.rowCount ?? result?.changes ?? 0;
}

export async function cleanupOldCallQueue(daysOld = 7) {
  await query(`
    DELETE FROM call_queue 
    WHERE created_at < now() - interval '${daysOld} days'
    AND status IN ('completed', 'failed', 'cancelled')
  `);
}

/**
 * Cancel extra pending `vapi_call` rows that share the same tenant + digit phone key (keeps earliest schedule).
 * Postgres only (queue dedupe for ops backfills).
 */
export async function dedupePendingVapiCallQueueRows() {
  if (dbType !== 'postgres' || !pool) {
    return { cancelled: 0, skipped: true };
  }
  const keyExpr = pgQueueLeadPhoneKeyExpr('cq.lead_phone');
  const result = await query(
    `
    WITH keyed AS (
      SELECT cq.id,
        cq.client_key,
        CASE
          WHEN (${keyExpr}) = '__nodigits__' THEN '__raw__:' || COALESCE(cq.lead_phone, '')
          ELSE (${keyExpr})
        END AS phone_key,
        cq.scheduled_for,
        cq.priority
      FROM call_queue cq
      WHERE cq.status = 'pending' AND cq.call_type = 'vapi_call'
    ),
    ranked AS (
      SELECT id,
        ROW_NUMBER() OVER (
          PARTITION BY client_key, phone_key
          ORDER BY scheduled_for ASC, priority ASC, id ASC
        ) AS rn
      FROM keyed
    )
    UPDATE call_queue q
    SET status = 'cancelled', updated_at = now()
    FROM ranked r
    WHERE q.id = r.id AND r.rn > 1
    `
  );
  return { cancelled: result?.rowCount ?? 0, skipped: false };
}

// Cost tracking functions
export async function trackCost({ clientKey, callId, costType, amount, currency = 'GBP', description, metadata }) {
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
export async function setBudgetLimit({ clientKey, budgetType, dailyLimit, weeklyLimit, monthlyLimit, currency = 'GBP' }) {
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

/** Deactivate all variant rows for this experiment name (before replacing from dashboard). */
export async function deactivateAbTestExperimentsByName(clientKey, experimentName) {
  if (!clientKey || !experimentName) return;
  await query(
    `UPDATE ab_test_experiments SET is_active = FALSE WHERE client_key = $1 AND experiment_name = $2`,
    [clientKey, String(experimentName).trim()]
  );
}

/** Prefer `variant_b`, else first non-control variant name for an active experiment. */
export async function resolveChallengerVariantNameForExperiment(clientKey, experimentName) {
  const name = experimentName != null ? String(experimentName).trim() : '';
  if (!clientKey || !name) return null;
  const { rows } = await query(
    `
    SELECT variant_name FROM ab_test_experiments
    WHERE client_key = $1 AND experiment_name = $2 AND is_active = TRUE
      AND LOWER(variant_name) != 'control'
    ORDER BY CASE WHEN LOWER(variant_name) = 'variant_b' THEN 0 ELSE 1 END, variant_name ASC
    LIMIT 1
  `,
    [clientKey, name]
  );
  const vn = rows[0]?.variant_name;
  return vn != null && String(vn).trim() ? String(vn).trim() : null;
}

/** In-place update so ab_test_results rows keep the same experiment_id. */
export async function updateActiveAbTestVariantConfig({ clientKey, experimentName, variantName, variantConfig }) {
  const en = experimentName != null ? String(experimentName).trim() : '';
  const vn = variantName != null ? String(variantName).trim() : '';
  if (!clientKey || !en || !vn) return null;
  const cfg = variantConfig && typeof variantConfig === 'object' ? variantConfig : {};
  const { rows } = await query(
    `
    UPDATE ab_test_experiments
    SET variant_config = $4::jsonb
    WHERE client_key = $1 AND experiment_name = $2 AND variant_name = $3 AND is_active = TRUE
    RETURNING *
  `,
    [clientKey, en, vn, JSON.stringify(cfg)]
  );
  return rows[0] || null;
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

export async function getABTestIndividualResults(experimentId) {
  const { rows } = await query(`
    SELECT 
      id,
      experiment_id,
      client_key,
      lead_phone,
      variant_name,
      outcome,
      outcome_data,
      created_at
    FROM ab_test_results 
    WHERE experiment_id = $1
    ORDER BY created_at DESC
  `, [experimentId]);
  return rows;
}

/**
 * Record a post-assignment outcome for a lead (finds the `assigned` row for this experiment name).
 */
export async function recordABTestOutcome({ clientKey, experimentName, leadPhone, outcome, outcomeData = null }) {
  try {
    const activeTests = await getActiveABTests(clientKey);
    const experimentVariants = activeTests.filter((test) => test.experiment_name === experimentName);

    if (!experimentVariants || experimentVariants.length === 0) {
      return null;
    }

    let assignment = null;
    for (const variant of experimentVariants) {
      const results = await getABTestIndividualResults(variant.id);
      assignment = results.find((r) => r.lead_phone === leadPhone && r.outcome === 'assigned');
      if (assignment) break;
    }

    if (!assignment) {
      console.log('[AB TEST OUTCOME] No assignment found for lead', { clientKey, experimentName, leadPhone });
      return null;
    }

    const result = await recordABTestResult({
      experimentId: assignment.experiment_id,
      clientKey,
      leadPhone,
      variantName: assignment.variant_name,
      outcome,
      outcomeData
    });

    console.log('[AB TEST OUTCOME RECORDED]', {
      clientKey,
      experimentName,
      leadPhone,
      variantName: assignment.variant_name,
      outcome
    });

    return result;
  } catch (error) {
    console.error('[AB TEST OUTCOME RECORDING ERROR]', error);
    return null;
  }
}

/** After a call ends, record `live_pickup` per outbound A/B experiment on the call metadata (non-voicemail pickups only). */
export async function recordOutboundAbLivePickups({
  clientKey,
  leadPhone,
  metadata,
  outcome,
  endedReason,
  durationSeconds: rawDurationSeconds = null
}) {
  if (!clientKey || !leadPhone) return;
  if (!isOutboundAbLivePickupOutcome(outcome, endedReason)) return;
  const names = collectOutboundAbExperimentNamesFromMetadata(metadata);
  if (!names.length) return;
  let durationSeconds = null;
  if (rawDurationSeconds != null && rawDurationSeconds !== '') {
    const n = Number(rawDurationSeconds);
    if (Number.isFinite(n) && n > 0) durationSeconds = Math.round(n * 10) / 10;
  }
  const outcomeData = { source: 'vapi_webhook', endedReason: endedReason || null, callOutcome: outcome ?? null };
  if (durationSeconds != null) outcomeData.durationSeconds = durationSeconds;
  for (const experimentName of names) {
    await recordABTestOutcome({
      clientKey,
      experimentName,
      leadPhone,
      outcome: 'live_pickup',
      outcomeData
    });
  }
}

function abTestExperimentIdPlaceholders(count, startAt = 1) {
  return Array.from({ length: count }, (_, i) => `$${startAt + i}`).join(', ');
}

/** @param {number[]} experimentIds */
async function loadAbTestConversionRatesByExperimentIds(experimentIds) {
  const ids = [...new Set(experimentIds.map((id) => Number(id)).filter((n) => Number.isFinite(n) && n > 0))];
  if (!ids.length) return new Map();
  const n = ids.length;
  const ph1 = abTestExperimentIdPlaceholders(n, 1);
  const ph2 = abTestExperimentIdPlaceholders(n, n + 1);
  const ph3 = abTestExperimentIdPlaceholders(n, 2 * n + 1);
  const params = [...ids, ...ids, ...ids];
  const { rows } = await poolQuerySelect(
    `
    WITH variant_totals AS (
      SELECT
        experiment_id,
        variant_name,
        COUNT(DISTINCT lead_phone) AS total_leads
      FROM ab_test_results
      WHERE experiment_id IN (${ph1})
      GROUP BY experiment_id, variant_name
    ),
    variant_live_pickups AS (
      SELECT
        experiment_id,
        variant_name,
        COUNT(DISTINCT lead_phone) AS live_pickup_leads
      FROM ab_test_results
      WHERE experiment_id IN (${ph2}) AND outcome = 'live_pickup'
      GROUP BY experiment_id, variant_name
    ),
    variant_conversions AS (
      SELECT
        experiment_id,
        variant_name,
        COUNT(DISTINCT lead_phone) AS converted_leads
      FROM ab_test_results
      WHERE experiment_id IN (${ph3}) AND outcome = 'converted'
      GROUP BY experiment_id, variant_name
    )
    SELECT
      vt.experiment_id,
      vt.variant_name,
      vt.total_leads,
      COALESCE(vlp.live_pickup_leads, 0) AS live_pickup_leads,
      COALESCE(vc.converted_leads, 0) AS converted_leads,
      CASE
        WHEN COALESCE(vlp.live_pickup_leads, 0) > 0
        THEN ROUND(
          CAST((COALESCE(vc.converted_leads, 0)::numeric / vlp.live_pickup_leads::numeric) * 100 AS numeric),
          2
        )
        WHEN vt.total_leads > 0
        THEN ROUND(
          CAST((COALESCE(vc.converted_leads, 0)::numeric / vt.total_leads::numeric) * 100 AS numeric),
          2
        )
        ELSE 0
      END AS conversion_rate
    FROM variant_totals vt
    LEFT JOIN variant_live_pickups vlp
      ON vlp.experiment_id = vt.experiment_id AND vlp.variant_name = vt.variant_name
    LEFT JOIN variant_conversions vc
      ON vc.experiment_id = vt.experiment_id AND vc.variant_name = vt.variant_name
    ORDER BY vt.experiment_id ASC, conversion_rate DESC
  `,
    params
  );
  /** @type {Map<number, object[]>} */
  const byExp = new Map();
  for (const r of rows || []) {
    const eid = Number(r.experiment_id);
    const row = {
      variant_name: r.variant_name,
      total_leads: r.total_leads,
      live_pickup_leads: r.live_pickup_leads,
      converted_leads: r.converted_leads,
      conversion_rate: r.conversion_rate
    };
    if (!byExp.has(eid)) byExp.set(eid, []);
    byExp.get(eid).push(row);
  }
  return byExp;
}

export async function getABTestConversionRates(experimentId) {
  const m = await loadAbTestConversionRatesByExperimentIds([experimentId]);
  return m.get(Number(experimentId)) || [];
}

/** @param {number[]} experimentIds */
async function loadAbTestLivePickupDurationStatsByExperimentIds(experimentIds) {
  const ids = [...new Set(experimentIds.map((id) => Number(id)).filter((n) => Number.isFinite(n) && n > 0))];
  if (!ids.length) return new Map();
  const ph = abTestExperimentIdPlaceholders(ids.length);
  const { rows } = await poolQuerySelect(
    `
    SELECT
      experiment_id,
      COUNT(*)::int AS n,
      ROUND(CAST(AVG(val) AS numeric), 1) AS avg_sec,
      ROUND(
        CAST((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY val)) AS numeric),
        1
      ) AS median_sec
    FROM (
      SELECT
        experiment_id,
        (outcome_data->>'durationSeconds')::numeric AS val
      FROM ab_test_results
      WHERE experiment_id IN (${ph})
        AND outcome = 'live_pickup'
        AND (outcome_data->>'durationSeconds') IS NOT NULL
        AND (outcome_data->>'durationSeconds')::numeric > 0
    ) t
    GROUP BY experiment_id
  `,
    ids
  );
  /** @type {Map<number, { n: number, avgSec: number|null, medianSec: number|null }>} */
  const m = new Map();
  for (const r of rows || []) {
    const eid = Number(r.experiment_id);
    m.set(eid, {
      n: parseInt(r.n, 10) || 0,
      avgSec: r.avg_sec != null ? Number(r.avg_sec) : null,
      medianSec: r.median_sec != null ? Number(r.median_sec) : null
    });
  }
  return m;
}

/** Median/avg talk time (seconds) for live_pickup rows that recorded durationSeconds (post-deploy webhooks). */
export async function getABTestLivePickupDurationStats(experimentId) {
  const m = await loadAbTestLivePickupDurationStatsByExperimentIds([experimentId]);
  return m.get(Number(experimentId)) || { n: 0, avgSec: null, medianSec: null };
}

/** @param {number[]} experimentIds */
async function loadAbTestConvertedCompletenessStatsByExperimentIds(experimentIds) {
  const ids = [...new Set(experimentIds.map((id) => Number(id)).filter((n) => Number.isFinite(n) && n > 0))];
  if (!ids.length) return new Map();
  const ph = abTestExperimentIdPlaceholders(ids.length);
  const { rows } = await poolQuerySelect(
    `
    SELECT
      experiment_id,
      COUNT(*)::int AS n,
      ROUND(CAST(AVG(val) AS numeric), 1) AS avg_score,
      ROUND(
        CAST((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY val)) AS numeric),
        1
      ) AS median_score
    FROM (
      SELECT
        experiment_id,
        (outcome_data->>'completenessScore')::numeric AS val
      FROM ab_test_results
      WHERE experiment_id IN (${ph})
        AND outcome = 'converted'
        AND (outcome_data->>'completenessScore') IS NOT NULL
        AND (outcome_data->>'completenessScore')::numeric >= 0
    ) t
    GROUP BY experiment_id
  `,
    ids
  );
  /** @type {Map<number, { n: number, avgScore: number|null, medianScore: number|null }>} */
  const m = new Map();
  for (const r of rows || []) {
    const eid = Number(r.experiment_id);
    m.set(eid, {
      n: parseInt(r.n, 10) || 0,
      avgScore: r.avg_score != null ? Number(r.avg_score) : null,
      medianScore: r.median_score != null ? Number(r.median_score) : null
    });
  }
  return m;
}

/** Completeness (0-100) for converted rows (sheet append), from outcome_data.completenessScore. */
export async function getABTestConvertedCompletenessStats(experimentId) {
  const m = await loadAbTestConvertedCompletenessStatsByExperimentIds([experimentId]);
  return m.get(Number(experimentId)) || { n: 0, avgScore: null, medianScore: null };
}

/** Safe previews of variant_config for dashboards (voice, opening, script). */
export function summarizeOutboundVariantConfig(variantConfig) {
  let c = variantConfig;
  if (c == null) {
    return { voiceId: null, openingLine: null, scriptPreview: null, scriptCharCount: 0 };
  }
  if (typeof c === 'string') {
    try {
      c = JSON.parse(c);
    } catch {
      return { voiceId: null, openingLine: null, scriptPreview: null, scriptCharCount: 0 };
    }
  }
  if (typeof c !== 'object' || c === null) {
    return { voiceId: null, openingLine: null, scriptPreview: null, scriptCharCount: 0 };
  }

  let voiceId = null;
  if (typeof c.voice === 'string' && c.voice.trim()) voiceId = c.voice.trim();
  else if (c.voice && typeof c.voice === 'object' && c.voice.voiceId) {
    voiceId = String(c.voice.voiceId).trim();
  }

  const open = c.firstMessage != null ? String(c.firstMessage).trim() : '';
  const scriptRaw =
    c.systemMessage != null ? String(c.systemMessage) : c.script != null ? String(c.script) : '';
  const scriptTrim = scriptRaw.trim();
  const scriptCharCount = scriptTrim.length;
  const maxScript = 280;
  const scriptPreview =
    scriptTrim.length === 0
      ? null
      : scriptTrim.length <= maxScript
        ? scriptTrim
        : `${scriptTrim.slice(0, maxScript).trim()}…`;

  const maxOpen = 200;
  const openingLine =
    open.length === 0 ? null : open.length <= maxOpen ? open : `${open.slice(0, maxOpen).trim()}…`;

  return { voiceId, openingLine, scriptPreview, scriptCharCount };
}

/**
 * Dashboard summary for one outbound A/B experiment (multiple variant rows share experiment_name).
 */
export async function getOutboundAbExperimentSummary(clientKey, experimentName) {
  if (!clientKey || !experimentName || !String(experimentName).trim()) return null;
  const name = String(experimentName).trim();
  const { rows: experiments } = await query(
    `
    SELECT id, variant_name, variant_config, is_active
    FROM ab_test_experiments
    WHERE client_key = $1 AND experiment_name = $2 AND is_active = TRUE
    ORDER BY variant_name ASC
  `,
    [clientKey, name]
  );
  if (!experiments.length) {
    return { experimentName: name, variants: [], hasDbVariants: false };
  }
  const expIds = experiments.map((e) => e.id);
  const [ratesByExp, durByExp, compByExp] = await Promise.all([
    loadAbTestConversionRatesByExperimentIds(expIds),
    loadAbTestLivePickupDurationStatsByExperimentIds(expIds),
    loadAbTestConvertedCompletenessStatsByExperimentIds(expIds)
  ]);
  const variants = [];
  for (const row of experiments) {
    const eid = Number(row.id);
    const rates = ratesByExp.get(eid) || [];
    const agg =
      rates.find((r) => r.variant_name === row.variant_name) || (rates.length === 1 ? rates[0] : null);
    const tested = summarizeOutboundVariantConfig(row.variant_config);
    const dur = durByExp.get(eid) || { n: 0, avgSec: null, medianSec: null };
    const comp = compByExp.get(eid) || { n: 0, avgScore: null, medianScore: null };
    variants.push({
      variantName: row.variant_name,
      totalLeads: parseInt(agg?.total_leads ?? 0, 10),
      livePickupLeads: parseInt(agg?.live_pickup_leads ?? 0, 10),
      convertedLeads: parseInt(agg?.converted_leads ?? 0, 10),
      conversionRatePct: agg?.conversion_rate != null ? Number(agg.conversion_rate) : 0,
      livePickupDurationCount: dur.n,
      avgTalkSeconds: dur.avgSec,
      medianTalkSeconds: dur.medianSec,
      convertedCompletenessCount: comp.n,
      avgCompletenessScore: comp.avgScore,
      medianCompletenessScore: comp.medianScore,
      tested
    });
  }
  return { experimentName: name, variants, hasDbVariants: true };
}

/**
 * When the tenant has exactly one distinct active experiment_name, return it (for dashboard / dial fallback).
 */
export async function inferOutboundAbExperimentName(clientKey) {
  if (!clientKey) return null;
  const { rows } = await query(
    `
    SELECT experiment_name
    FROM ab_test_experiments
    WHERE client_key = $1 AND is_active = TRUE
    GROUP BY experiment_name
    ORDER BY experiment_name ASC
  `,
    [clientKey]
  );
  if (rows.length !== 1) return null;
  const n = rows[0].experiment_name;
  return n != null && String(n).trim() !== '' ? String(n).trim() : null;
}

function parseAbVariantConfigJson(raw) {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof raw === 'object') return raw;
  return null;
}

function variantConfigFieldPresence(c) {
  if (!c || typeof c !== 'object') {
    return { hasVoice: false, hasOpening: false, hasScript: false };
  }
  let hasVoice = false;
  if (typeof c.voice === 'string' && c.voice.trim()) hasVoice = true;
  else if (c.voice && typeof c.voice === 'object' && c.voice.voiceId && String(c.voice.voiceId).trim()) {
    hasVoice = true;
  }
  const open = c.firstMessage != null ? String(c.firstMessage).trim() : '';
  const hasOpening = open.length > 0;
  const scriptRaw =
    c.systemMessage != null ? String(c.systemMessage) : c.script != null ? String(c.script) : '';
  const hasScript = scriptRaw.trim().length > 0;
  return { hasVoice, hasOpening, hasScript };
}

function activeRowsAreVoiceOnly(rows) {
  if (!rows || rows.length < 2) return false;
  for (const r of rows) {
    const p = variantConfigFieldPresence(parseAbVariantConfigJson(r.variant_config));
    if (!p.hasVoice || p.hasOpening || p.hasScript) return false;
  }
  return true;
}

function activeRowsAreOpeningOnly(rows) {
  if (!rows || rows.length < 2) return false;
  for (const r of rows) {
    const p = variantConfigFieldPresence(parseAbVariantConfigJson(r.variant_config));
    if (!p.hasOpening || p.hasVoice || p.hasScript) return false;
  }
  return true;
}

function activeRowsAreScriptOnly(rows) {
  if (!rows || rows.length < 2) return false;
  for (const r of rows) {
    const p = variantConfigFieldPresence(parseAbVariantConfigJson(r.variant_config));
    if (!p.hasScript || p.hasVoice || p.hasOpening) return false;
  }
  return true;
}

/**
 * Deactivate every active experiment whose variants match this outbound A/B dimension slice
 * (dimensional control `{}` + challenger, or legacy “all variants carry the same slice field”).
 * Used when stopping a dimension so DB state cannot disagree with cleared vapi slots.
 */
export async function deactivateAllActiveOutboundAbSliceExperiments(clientKey, dimension) {
  const d = String(dimension || '').trim().toLowerCase();
  if (!clientKey || (d !== 'voice' && d !== 'opening' && d !== 'script')) return 0;
  const active = await getActiveABTests(clientKey);
  const byName = new Map();
  for (const row of active) {
    const n = row.experiment_name != null ? String(row.experiment_name).trim() : '';
    if (!n) continue;
    if (!byName.has(n)) byName.set(n, []);
    byName.get(n).push(row);
  }
  let count = 0;
  for (const [name, rows] of byName) {
    if (activeRowsMatchOutboundAbStopSlice(rows, d)) {
      await deactivateAbTestExperimentsByName(clientKey, name);
      count += 1;
    }
  }
  return count;
}

/**
 * When vapi dimensional keys are unset, infer at most one experiment name per slice
 * (all variants must be that slice only, and ≥2 variants).
 */
export async function inferOutboundAbExperimentNamesForDimensions(clientKey) {
  if (!clientKey) {
    return { voice: null, opening: null, script: null };
  }
  const active = await getActiveABTests(clientKey);
  const byName = new Map();
  for (const row of active) {
    const n = row.experiment_name != null ? String(row.experiment_name).trim() : '';
    if (!n) continue;
    if (!byName.has(n)) byName.set(n, []);
    byName.get(n).push(row);
  }
  const voiceCandidates = [];
  const openingCandidates = [];
  const scriptCandidates = [];
  for (const [name, rows] of byName) {
    if (activeRowsAreVoiceOnly(rows)) voiceCandidates.push(name);
    if (activeRowsAreOpeningOnly(rows)) openingCandidates.push(name);
    if (activeRowsAreScriptOnly(rows)) scriptCandidates.push(name);
  }
  voiceCandidates.sort();
  openingCandidates.sort();
  scriptCandidates.sort();
  return {
    voice: voiceCandidates.length === 1 ? voiceCandidates[0] : null,
    opening: openingCandidates.length === 1 ? openingCandidates[0] : null,
    script: scriptCandidates.length === 1 ? scriptCandidates[0] : null
  };
}

/**
 * Recover dashboard / dialer linkage when vapi_json lost outboundAb*Experiment keys but the
 * bundle triple (…_voice, …_open, …_script) is still active in ab_test_experiments.
 * Picks the newest triple by max(created_at) across the three experiment names.
 */
export async function inferOutboundAbBundleTriple(clientKey) {
  if (!clientKey) return null;
  const { rows } = await query(
    `
    SELECT experiment_name, MAX(created_at) AS newest
    FROM ab_test_experiments
    WHERE client_key = $1 AND is_active = TRUE
    GROUP BY experiment_name
    `,
    [clientKey]
  );
  const names = new Set();
  const newestByName = new Map();
  for (const row of rows || []) {
    const n = row.experiment_name != null ? String(row.experiment_name).trim() : '';
    if (!n) continue;
    names.add(n);
    const t = row.newest != null ? new Date(row.newest).getTime() : 0;
    newestByName.set(n, t);
  }
  const stems = new Map();
  for (const name of names) {
    if (!name.startsWith('ab_b_')) continue;
    let stem;
    let dim;
    if (name.endsWith('_voice')) {
      stem = name.slice(0, -6);
      dim = 'voice';
    } else if (name.endsWith('_script')) {
      stem = name.slice(0, -7);
      dim = 'script';
    } else if (name.endsWith('_open')) {
      stem = name.slice(0, -5);
      dim = 'opening';
    } else continue;
    if (!stems.has(stem)) stems.set(stem, {});
    stems.get(stem)[dim] = name;
  }
  const complete = [];
  for (const [stem, o] of stems) {
    if (o.voice && o.opening && o.script) {
      const t = Math.max(
        newestByName.get(o.voice) || 0,
        newestByName.get(o.opening) || 0,
        newestByName.get(o.script) || 0
      );
      complete.push({ stem, voice: o.voice, opening: o.opening, script: o.script, t });
    }
  }
  if (complete.length === 0) return null;
  complete.sort((a, b) => b.t - a.t);
  const pick = complete[0];
  return { voice: pick.voice, opening: pick.opening, script: pick.script };
}

// Security and Authentication functions
export async function createUserAccount({ clientKey, username, email, passwordHash, role = 'user', permissions = [] }) {
  const permissionsJson = JSON.stringify(permissions);
  
  const { rows } = await query(`
    INSERT INTO user_accounts (client_key, username, email, password_hash, role, permissions)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id, username, email, role, permissions, is_active, created_at
  `, [clientKey, username, email, passwordHash, role, permissionsJson]);
  
  return rows[0];
}

export async function getUserByUsername(username) {
  const { rows } = await query(`
    SELECT u.*, t.display_name as client_name
    FROM user_accounts u
    JOIN tenants t ON u.client_key = t.client_key
    WHERE u.username = $1 AND u.is_active = TRUE
  `, [username]);
  return rows[0];
}

export async function getUserByEmail(email) {
  const { rows } = await query(`
    SELECT u.*, t.display_name as client_name
    FROM user_accounts u
    JOIN tenants t ON u.client_key = t.client_key
    WHERE u.email = $1 AND u.is_active = TRUE
  `, [email]);
  return rows[0];
}

export async function updateUserLastLogin(userId) {
  await query(`
    UPDATE user_accounts 
    SET last_login = now(), updated_at = now()
    WHERE id = $1
  `, [userId]);
}

export async function getUsersByClient(clientKey) {
  const { rows } = await query(`
    SELECT id, username, email, role, permissions, is_active, last_login, created_at
    FROM user_accounts 
    WHERE client_key = $1
    ORDER BY created_at DESC
  `, [clientKey]);
  return rows;
}

// API Key management functions
export async function createApiKey({ clientKey, keyName, keyHash, permissions = [], rateLimitPerMinute = 100, rateLimitPerHour = 1000, expiresAt = null }) {
  const permissionsJson = JSON.stringify(permissions);
  
  const { rows } = await query(`
    INSERT INTO api_keys (client_key, key_name, key_hash, permissions, rate_limit_per_minute, rate_limit_per_hour, expires_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id, key_name, permissions, rate_limit_per_minute, rate_limit_per_hour, is_active, expires_at, created_at
  `, [clientKey, keyName, keyHash, permissionsJson, rateLimitPerMinute, rateLimitPerHour, expiresAt]);
  
  return rows[0];
}

export async function getApiKeyByHash(keyHash) {
  const { rows } = await query(`
    SELECT ak.*, t.display_name as client_name
    FROM api_keys ak
    JOIN tenants t ON ak.client_key = t.client_key
    WHERE ak.key_hash = $1 AND ak.is_active = TRUE
    AND (ak.expires_at IS NULL OR ak.expires_at > now())
  `, [keyHash]);
  return rows[0];
}

export async function updateApiKeyLastUsed(keyId) {
  await query(`
    UPDATE api_keys 
    SET last_used = now()
    WHERE id = $1
  `, [keyId]);
}

export async function getApiKeysByClient(clientKey) {
  const { rows } = await query(`
    SELECT id, key_name, permissions, rate_limit_per_minute, rate_limit_per_hour, is_active, last_used, expires_at, created_at
    FROM api_keys 
    WHERE client_key = $1
    ORDER BY created_at DESC
  `, [clientKey]);
  return rows;
}

// Rate limiting functions
export async function checkRateLimit({ clientKey, apiKeyId, endpoint, ipAddress, limitPerMinute, limitPerHour }) {
  const now = new Date();
  const minuteAgo = new Date(now.getTime() - 60 * 1000);
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  
  // Check minute limit
  const { rows: minuteRows } = await query(`
    SELECT COUNT(*) as count FROM rate_limit_tracking 
    WHERE client_key = $1 
    AND (api_key_id = $2 OR api_key_id IS NULL)
    AND endpoint = $3
    AND (ip_address = $4 OR ip_address IS NULL)
    AND window_start > $5
  `, [clientKey, apiKeyId, endpoint, ipAddress, minuteAgo]);
  
  const minuteCount = parseInt(minuteRows[0]?.count || 0);
  
  // Check hour limit
  const { rows: hourRows } = await query(`
    SELECT COUNT(*) as count FROM rate_limit_tracking 
    WHERE client_key = $1 
    AND (api_key_id = $2 OR api_key_id IS NULL)
    AND endpoint = $3
    AND (ip_address = $4 OR ip_address IS NULL)
    AND window_start > $5
  `, [clientKey, apiKeyId, endpoint, ipAddress, hourAgo]);
  
  const hourCount = parseInt(hourRows[0]?.count || 0);
  
  const exceeded = minuteCount >= limitPerMinute || hourCount >= limitPerHour;
  
  return {
    exceeded,
    minuteCount,
    hourCount,
    minuteLimit: limitPerMinute,
    hourLimit: limitPerHour,
    remainingMinute: Math.max(0, limitPerMinute - minuteCount),
    remainingHour: Math.max(0, limitPerHour - hourCount)
  };
}

export async function recordRateLimitRequest({ clientKey, apiKeyId, endpoint, ipAddress }) {
  await query(`
    INSERT INTO rate_limit_tracking (client_key, api_key_id, endpoint, ip_address)
    VALUES ($1, $2, $3, $4)
  `, [clientKey, apiKeyId, endpoint, ipAddress]);
}

export async function cleanupOldRateLimitRecords(hoursOld = 24) {
  await query(`
    DELETE FROM rate_limit_tracking 
    WHERE window_start < now() - interval '${hoursOld} hours'
  `);
}

// Security event logging functions
export async function logSecurityEvent({ clientKey, eventType, eventSeverity = 'info', eventData = null, ipAddress = null, userAgent = null }) {
  // Skip logging for unknown/anonymous clients to avoid foreign key violations
  if (!clientKey || clientKey === 'unknown' || clientKey === 'anonymous') {
    return null;
  }
  
  // Verify client exists before logging (to avoid foreign key violations)
  try {
    const client = await getFullClient(clientKey);
    if (!client) {
      // Client doesn't exist, skip logging
      return null;
    }
  } catch (error) {
    // Error checking client, skip logging to avoid cascading errors
    return null;
  }
  
  const eventDataJson = eventData ? JSON.stringify(eventData) : null;
  
  try {
    const { rows } = await query(`
      INSERT INTO security_events (client_key, event_type, event_severity, event_data, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [clientKey, eventType, eventSeverity, eventDataJson, ipAddress, userAgent]);
    
    return rows[0];
  } catch (error) {
    // Silently fail security event logging to avoid breaking the main request
    console.warn('[SECURITY LOG] Failed to log security event:', error.message);
    return null;
  }
}

export async function getSecurityEvents(clientKey, limit = 100, eventType = null, severity = null) {
  let queryStr = `
    SELECT * FROM security_events 
    WHERE client_key = $1
  `;
  const params = [clientKey];
  
  if (eventType) {
    queryStr += ` AND event_type = $${params.length + 1}`;
    params.push(eventType);
  }
  
  if (severity) {
    queryStr += ` AND event_severity = $${params.length + 1}`;
    params.push(severity);
  }
  
  queryStr += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
  params.push(limit);
  
  const { rows } = await query(queryStr, params);
  return rows;
}

export async function getSecurityEventSummary(clientKey, days = 7) {
  const { rows } = await query(`
    SELECT 
      event_type,
      event_severity,
      COUNT(*) as event_count,
      COUNT(DISTINCT ip_address) as unique_ips
    FROM security_events 
    WHERE client_key = $1 
    AND created_at > now() - interval '${days} days'
    GROUP BY event_type, event_severity
    ORDER BY event_count DESC
  `, [clientKey]);
  return rows;
}
