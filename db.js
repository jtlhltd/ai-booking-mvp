// db.js (ESM) — Postgres first, SQLite fallback, and helpers expected by server/libs
import { createHash } from 'crypto';
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
import {
  collectOutboundAbExperimentNamesFromMetadata,
  isOutboundAbLivePickupOutcome
} from './lib/outbound-ab-live-pickup.js';
import { getCallAnalyticsEnvOverrideIso } from './lib/call-analytics-cutoff.js';
import { activeRowsMatchOutboundAbStopSlice } from './lib/outbound-ab-stop-slice.js';
import { phoneMatchKey, pgQueueLeadPhoneKeyExpr, outboundDialClaimKeyFromRaw } from './lib/lead-phone-key.js';
import { getClientKeyLookupCandidates } from './lib/client-key-lookup.js';
import { normalizePhoneE164 } from './lib/utils.js';
import { resolveTenantTimezone } from './lib/timezone-resolver.js';
import { createPostgresPoolAndLimiter, testPostgresPoolConnection } from './db/connection.js';
import { createQueryRunner } from './db/query.js';
import * as callQueueReads from './db/call-queue-reads.js';
import * as callQueueWrites from './db/call-queue-writes.js';
import { smearCallQueueScheduledFor } from './db/call-queue-smear.js';
import { createOptOutDomain } from './db/domains/opt-outs.js';
import { createQualityAlertsDomain } from './db/domains/quality-alerts.js';
import { createRetryQueueDomain } from './db/domains/retry-queue.js';
import { createCallInsightsDomain } from './db/domains/call-insights.js';
import { createOutboundWeekdayJourneyDomain } from './db/domains/outbound-weekday-journey.js';
import { createCallsDomain } from './db/domains/calls.js';
import { createCallQueueDomain } from './db/domains/call-queue.js';
import { createCallTimeBanditDomain } from './db/domains/call-time-bandit.js';
import { createLeadHandoffDomain } from './db/domains/lead-handoff.js';
import { createLeadSequenceStateDomain } from './db/domains/lead-sequence-state.js';
import { createApiKeysRateLimitDomain } from './db/domains/api-keys-rate-limit.js';
import { migratePostgresLeadsPhoneMatchKey } from './db/migrations/postgres-leads-phone-match-key.js';
import { migratePostgresCallsLeadPhoneMatchKey } from './db/migrations/postgres-calls-lead-phone-match-key.js';
import { migrateSqliteLeadsPhoneMatchKey } from './db/migrations/sqlite-leads-phone-match-key.js';
import { migrateSqliteCallsLeadPhoneMatchKey } from './db/migrations/sqlite-calls-lead-phone-match-key.js';
import { migrateOptOutListTenantScope } from './db/migrations/opt-out-tenant-scope.js';
import { ensurePostgresCoreSchema } from './db/migrations/postgres-core-schema.js';
import {
  ensureSqliteCallQueueAndQualityAlertsTables as ensureSqliteCallQueueAndQualityAlertsTablesRaw,
  ensureSqliteCoreSchema
} from './db/migrations/sqlite-core-schema.js';

const dbType = (process.env.DB_TYPE || '').toLowerCase();
let pool = null;
/** When set, caps simultaneous in-flight `pool.query` calls (whole process shares one limit). */
let pgQueryLimiter = null;
let sqlite = null;
let DB_PATH = 'postgres';

const _dbQuery = createQueryRunner(() => ({ dbType, pool, sqlite, pgQueryLimiter }));
export const query = _dbQuery.query;
export const poolQuerySelect = _dbQuery.poolQuerySelect;
export const safeQuery = _dbQuery.safeQuery;

console.log('🔍 Database configuration:', {
  DB_TYPE: process.env.DB_TYPE,
  dbType: dbType,
  DATABASE_URL: process.env.DATABASE_URL ? 'SET' : 'NOT SET'
});

// (JsonFileDatabase moved to ./db/json-file-database.js)

// Migrations were extracted into db/migrations/* to keep this facade smaller.

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
    const { pool: newPool, pgQueryLimiter: newLimiter, maxConnections, queryConc } =
      createPostgresPoolAndLimiter(dbUrl, process.env);
    pool = newPool;
    pgQueryLimiter = newLimiter;

    if (pgQueryLimiter) {
      console.log(
        `🔌 DB query concurrency cap: ${queryConc} simultaneous queries (DB_QUERY_CONCURRENCY=0 disables)`
      );
    }

    console.log(`🔌 Database pool configured: max=${maxConnections} connections`);

    console.log('🔌 Testing Postgres connection...');
    await testPostgresPoolConnection(pool, 10000);
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
    pgQueryLimiter = null;
    throw error;
  }

  try {
    // Run migrations for schema creation
    await ensurePostgresCoreSchema(pool);

    try {
      const { migrateTomOutboundSequencePostgres } = await import('./db/migrations/seed-tom-outbound-sequence.js');
      await migrateTomOutboundSequencePostgres(pool);
    } catch (seedErr) {
      console.warn('⚠️  Tom outbound_sequence_json seed (non-fatal):', seedErr?.message || seedErr);
    }

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
    ensureSqliteCallQueueAndQualityAlertsTablesRaw(sqlite);
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
  ensureSqliteCoreSchema(sqlite);

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

async function migrateOptOutListTenantScopeFacade() {
  return migrateOptOutListTenantScope({ dbType, pool, sqlite, query });
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
      await migrateOptOutListTenantScopeFacade();
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
  await migrateSqliteLeadsPhoneMatchKey({ sqlite, phoneMatchKey }).catch((e) =>
    console.warn('⚠️  SQLite phone_match_key migration:', e.message)
  );
  await migrateSqliteCallsLeadPhoneMatchKey({ sqlite, phoneMatchKey }).catch((e) =>
    console.warn('⚠️  SQLite calls.lead_phone_match_key migration:', e.message)
  );
  await migrateOptOutListTenantScopeFacade();
  try {
    const { migrateTomOutboundSequenceSqlite } = await import('./db/migrations/seed-tom-outbound-sequence.js');
    migrateTomOutboundSequenceSqlite(sqlite);
  } catch (seedErr) {
    console.warn('⚠️  Tom outbound_sequence_json seed sqlite (non-fatal):', seedErr?.message || seedErr);
  }
  await getCallAnalyticsFloorIso().catch((e) =>
    console.warn('[call_analytics_floor] init:', e.message)
  );
  return r;
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

export { DB_PATH, pool, dbType };

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
  const outboundSequence = toJson(r.outbound_sequence_json);

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
    outboundSequence: outboundSequence && typeof outboundSequence === 'object' ? outboundSequence : null,
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
           white_label_config, outbound_sequence_json, is_enabled, created_at
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
  const candidates = getClientKeyLookupCandidates(clientKey);

  if (!bypassCache) {
    for (const ck of candidates) {
      const cacheKey = `client:${ck}`;
      const cached = clientCache.get(cacheKey);
      if (cached && Date.now() < cached.expires) {
        return cached.data;
      }
    }
  }

  let row = null;
  for (const ck of candidates) {
    const { rows } = await query(
      `
    SELECT client_key, display_name, timezone, locale,
           numbers_json, twilio_json, vapi_json, calendar_json, sms_templates_json, 
           white_label_config, outbound_sequence_json, is_enabled, created_at
    FROM tenants WHERE client_key = $1
  `,
      [ck]
    );
    if (rows[0]) {
      row = rows[0];
      break;
    }
  }

  const client = mapTenantRow(row);

  if (client) {
    const entry = {
      data: client,
      expires: Date.now() + CLIENT_CACHE_TTL
    };
    for (const ck of candidates) {
      clientCache.set(`client:${ck}`, entry);
    }
    const dbKey = client.clientKey;
    if (dbKey && !candidates.includes(dbKey)) {
      clientCache.set(`client:${dbKey}`, entry);
    }
  }

  return client;
}

// Invalidate client cache (call after updates)
export function invalidateClientCache(clientKey) {
  const keysToClear = new Set(getClientKeyLookupCandidates(clientKey));
  keysToClear.add(String(clientKey || '').trim());
  for (const ck of keysToClear) {
    if (ck) clientCache.delete(`client:${ck}`);
  }
  // Also clear any related caches (copy keys: delete during iteration is unsafe)
  for (const key of [...clientCache.keys()]) {
    for (const ck of keysToClear) {
      if (ck && key.includes(ck)) {
        clientCache.delete(key);
      }
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
  const resolvedTimezone = resolveTenantTimezone(c);
  const nextBooking = {
    ...(c.booking && typeof c.booking === 'object' ? c.booking : {}),
    defaultDurationMin:
      c?.booking?.defaultDurationMin != null
        ? c.booking.defaultDurationMin
        : (c.bookingDefaultDurationMin || 30),
    timezone: resolvedTimezone
  };
  const calendar = {
    calendarId: c.calendarId || c.gcalCalendarId || null,
    services: Array.isArray(c.services) ? c.services.reduce((acc, s) => { acc[s.id] = s; return acc; }, {}) : (c.serviceMap || {}),
    booking: nextBooking
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
    c.clientKey, c.displayName || c.clientKey, resolvedTimezone || null, c.locale || 'en-GB',
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

export async function upsertImportedLead({
  clientKey,
  name = null,
  phone,
  service = null,
  source = null,
  leadDialContext = null,
}) {
  const mk = phoneMatchKey(phone);
  if (!clientKey || !phone || !mk) throw new Error('upsertImportedLead requires clientKey + phone');

  const existing = await query(
    'SELECT * FROM leads WHERE client_key = $1 AND phone_match_key = $2 ORDER BY created_at DESC LIMIT 1',
    [clientKey, mk]
  );
  const current = existing?.rows?.[0] || null;
  const contextJson =
    leadDialContext && typeof leadDialContext === 'object' && !Array.isArray(leadDialContext)
      ? JSON.stringify(leadDialContext)
      : null;

  if (current) {
    const result = await query(
      dbType === 'postgres'
        ? `UPDATE leads
           SET name = COALESCE($3, name),
               phone = $4,
               service = COALESCE($5, service),
               source = COALESCE($6, source),
               lead_dial_context_json = COALESCE($7::jsonb, lead_dial_context_json)
           WHERE client_key = $1 AND phone_match_key = $2
           RETURNING *`
        : `UPDATE leads
           SET name = COALESCE($3, name),
               phone = $4,
               service = COALESCE($5, service),
               source = COALESCE($6, source),
               lead_dial_context_json = COALESCE($7, lead_dial_context_json)
           WHERE client_key = $1 AND phone_match_key = $2
           RETURNING *`,
      [clientKey, mk, name, phone, service, source, contextJson]
    );
    return { row: result?.rows?.[0] || current, created: false };
  }

  const inserted = await query(
    dbType === 'postgres'
      ? `INSERT INTO leads (
           client_key, name, phone, phone_match_key, service, source, lead_dial_context_json
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
         RETURNING *`
      : `INSERT INTO leads (
           client_key, name, phone, phone_match_key, service, source, lead_dial_context_json
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
    [clientKey, name, phone, mk, service, source, contextJson]
  );
  return { row: inserted?.rows?.[0] || null, created: true };
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

/**
 * Best-effort idempotency guard for booking retries.
 * If we already booked the same lead into the same slot, return the existing appointment row.
 */
export async function findExistingBooking({ tenantKey, leadId = null, slot }) {
  if (!tenantKey || !slot?.start || !slot?.end) return null;
  const result = await query(
    `SELECT * FROM appointments
     WHERE client_key = $1
       AND status = 'booked'
       AND start_iso = $2
       AND end_iso = $3
       AND ($4 IS NULL OR lead_id = $4)
     LIMIT 1`,
    [tenantKey, slot.start, slot.end, leadId]
  );
  const rows = result?.rows || [];
  return rows.length > 0 ? rows[0] : null;
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
// Outbound weekday journey domain (extracted)
const outboundWeekdayJourneyDomain = createOutboundWeekdayJourneyDomain({
  dbType,
  pool,
  sqlite,
  pgQueryLimiter,
  query,
  createHash,
  outboundDialClaimKeyFromRaw,
});
export const clearOutboundWeekdayJourneyForReopen = outboundWeekdayJourneyDomain.clearOutboundWeekdayJourneyForReopen;
export const hasOutboundWeekdayJourneyDialBlocked = outboundWeekdayJourneyDomain.hasOutboundWeekdayJourneyDialBlocked;
export const claimOutboundWeekdayJourneySlot = outboundWeekdayJourneyDomain.claimOutboundWeekdayJourneySlot;
export const rollbackOutboundWeekdayJourneySlot = outboundWeekdayJourneyDomain.rollbackOutboundWeekdayJourneySlot;
export const closeOutboundWeekdayJourneyOnLivePickup = outboundWeekdayJourneyDomain.closeOutboundWeekdayJourneyOnLivePickup;
export const hasOutboundCallAttemptToday = outboundWeekdayJourneyDomain.hasOutboundCallAttemptToday;
export const claimOutboundDialSlotForToday = outboundWeekdayJourneyDomain.claimOutboundDialSlotForToday;

// Call insights + analytics floor domain (extracted)
const callInsightsDomain = createCallInsightsDomain({ dbType, pool, sqlite, query });
export const upsertCallInsights = callInsightsDomain.upsertCallInsights;
export const getLatestCallInsights = callInsightsDomain.getLatestCallInsights;
export const getCallAnalyticsFloorIso = callInsightsDomain.getCallAnalyticsFloorIso;

// Calls domain (extracted)
const callsDomain = createCallsDomain({ query, getCallAnalyticsFloorIso });
export const getCallsByTenant = callsDomain.getCallsByTenant;
export const getCallsByPhone = callsDomain.getCallsByPhone;
export const getRecentCallsCount = callsDomain.getRecentCallsCount;
export const getCallQualityMetrics = callsDomain.getCallQualityMetrics;

// Lead handoff / qualification domain (extracted)
const leadHandoffDomain = createLeadHandoffDomain({ query, phoneMatchKey, dbType });
export const upsertLeadHandoff = leadHandoffDomain.upsertLeadHandoff;
export const getLeadHandoffByPhone = leadHandoffDomain.getLeadHandoffByPhone;
export const listLeadHandoff = leadHandoffDomain.listLeadHandoff;
export const setLeadHandoffOperatorNotes = leadHandoffDomain.setOperatorNotes;

const leadSequenceStateDomain = createLeadSequenceStateDomain({ query, dbType });
export const insertLeadSequenceState = leadSequenceStateDomain.insertLeadSequenceState;
export const getLeadSequenceState = leadSequenceStateDomain.getLeadSequenceState;
export const updateLeadSequenceState = leadSequenceStateDomain.updateLeadSequenceState;

// Call time bandit domain (extracted)
const callTimeBanditDomain = createCallTimeBanditDomain({
  query,
  poolQuerySelect,
  getCallAnalyticsFloorIso,
  getFullClient,
});
export const getCallTimeBanditState = callTimeBanditDomain.getCallTimeBanditState;
export const getCallTimeBanditForDashboard = callTimeBanditDomain.getCallTimeBanditForDashboard;
export const backfillCallTimeBanditObservations = callTimeBanditDomain.backfillCallTimeBanditObservations;
export const recordCallScheduleDecision = callTimeBanditDomain.recordCallScheduleDecision;
export const recordCallTimeBanditAfterCallComplete = callTimeBanditDomain.recordCallTimeBanditAfterCallComplete;

 

// Quality alerts domain (extracted)
const qualityAlertsDomain = createQualityAlertsDomain({ query });
export const getQualityAlerts = qualityAlertsDomain.getQualityAlerts;
export const resolveQualityAlert = qualityAlertsDomain.resolveQualityAlert;
export const storeQualityAlert = qualityAlertsDomain.storeQualityAlert;

// Retry queue domain (extracted)
const retryQueueDomain = createRetryQueueDomain({ query });
export const addToRetryQueue = retryQueueDomain.addToRetryQueue;
export const getPendingRetries = retryQueueDomain.getPendingRetries;
export const updateRetryStatus = retryQueueDomain.updateRetryStatus;
export const getRetriesByPhone = retryQueueDomain.getRetriesByPhone;
export const cancelPendingRetries = retryQueueDomain.cancelPendingRetries;
export const cancelPendingFollowUps = retryQueueDomain.cancelPendingFollowUps;
export const cleanupOldRetries = retryQueueDomain.cleanupOldRetries;

const apiKeysRateLimitDomain = createApiKeysRateLimitDomain({ query });
export const updateApiKeyLastUsed = apiKeysRateLimitDomain.updateApiKeyLastUsed;
export const getApiKeysByClient = apiKeysRateLimitDomain.getApiKeysByClient;
export const checkRateLimit = apiKeysRateLimitDomain.checkRateLimit;
export const recordRateLimitRequest = apiKeysRateLimitDomain.recordRateLimitRequest;
export const cleanupOldRateLimitRecords = apiKeysRateLimitDomain.cleanupOldRateLimitRecords;

// Call queue domain (extracted)
const callQueueDomain = createCallQueueDomain({
  getDbType: () => dbType,
  getPool: () => pool,
  getSqlite: () => sqlite,
  query,
  phoneMatchKey,
  outboundDialClaimKeyFromRaw,
  smearCallQueueScheduledFor,
  pgQueueLeadPhoneKeyExpr,
  callQueueReads,
  callQueueWrites,
});

export const invalidateOptOutDialCache = callQueueDomain.invalidateOptOutDialCache;
export const addToCallQueue = callQueueDomain.addToCallQueue;
export const getPendingCalls = callQueueDomain.getPendingCalls;
export const updateCallQueueStatus = callQueueDomain.updateCallQueueStatus;
export const cancelDuplicatePendingCalls = callQueueDomain.cancelDuplicatePendingCalls;
export const getCallQueueByTenant = callQueueDomain.getCallQueueByTenant;
export const getCallQueueByPhone = callQueueDomain.getCallQueueByPhone;
export const clearCallQueue = callQueueDomain.clearCallQueue;
export const cleanupOldCallQueue = callQueueDomain.cleanupOldCallQueue;
export const dedupePendingVapiCallQueueRows = callQueueDomain.dedupePendingVapiCallQueueRows;

const optOutDomain = createOptOutDomain({
  dbType,
  query,
  normalizePhoneE164,
  invalidateOptOutDialCache,
});
export const listOptOutList = optOutDomain.listOptOutList;
export const upsertOptOut = optOutDomain.upsertOptOut;
export const deactivateOptOut = optOutDomain.deactivateOptOut;

export { smearCallQueueScheduledFor };

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
