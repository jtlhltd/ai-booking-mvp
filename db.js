// db.js (ESM) — Postgres first, SQLite fallback, and helpers expected by server/libs
import { Pool } from 'pg';
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
import { getCache } from './lib/cache.js';

const dbType = (process.env.DB_TYPE || '').toLowerCase();
let pool = null;
let sqlite = null;
let DB_PATH = 'postgres';

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
    // Render.com databases support up to 103 connections (verified via /api/database/connection-limit)
    // Set pool to 15 to handle concurrent requests efficiently while leaving plenty of headroom
    // This prevents connection exhaustion while maintaining good performance
    // Default to 15 connections - can be overridden with DB_POOL_MAX env var
    const maxConnections = parseInt(process.env.DB_POOL_MAX) || 15;
    
    pool = new Pool({
      connectionString: dbUrl,
      ssl: { rejectUnauthorized: false },
      max: maxConnections, // Reduced to match database connection limits (Render free tier = 3)
      idleTimeoutMillis: 10000, // Close idle connections after 10 seconds (more aggressive)
      connectionTimeoutMillis: 5000, // Reduced to 5 seconds for faster failure detection
      statement_timeout: 20000, // 20 second query timeout to prevent hanging queries
      allowExitOnIdle: true, // Allow pool to close when idle
    });
    
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
    CREATE INDEX IF NOT EXISTS calls_status_idx ON calls(status);
    CREATE INDEX IF NOT EXISTS calls_outcome_idx ON calls(outcome);
    CREATE INDEX IF NOT EXISTS calls_created_idx ON calls(created_at);

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
      query_hash TEXT NOT NULL,
      query_preview TEXT,
      avg_duration DECIMAL(10,2),
      max_duration DECIMAL(10,2),
      call_count INTEGER DEFAULT 1,
      last_executed_at TIMESTAMPTZ DEFAULT now(),
      created_at TIMESTAMPTZ DEFAULT now()
    );
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
    
    console.log('✅ Call quality columns migration complete');
  } catch (migrationError) {
    console.error('⚠️  Column migration error (non-fatal):', migrationError.message);
    // Don't fail startup if migration fails - columns might already exist
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
    CREATE TABLE IF NOT EXISTS idempotency (
      client_key TEXT NOT NULL,
      key TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (client_key, key)
    );
  `);

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
      return await initPostgres();
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
  return initSqlite();
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
  
  // For SELECT queries, check cache first
  if (text.trim().toUpperCase().startsWith('SELECT')) {
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
      result = await pool.query(text, params);
    } else if (sqlite) {
      // Convert PostgreSQL-style placeholders ($1, $2, etc.) to SQLite-style (?)
      let sqliteText = text;
      if (text.includes('$1')) {
        // Replace $1, $2, etc. with ?
        sqliteText = text.replace(/\$\d+/g, '?');
      }
      const stmt = sqlite.prepare(sqliteText);
      if (text.trim().toUpperCase().startsWith('SELECT')) {
        result = { rows: stmt.all(...params) };
      } else {
        result = stmt.run(...params);
      }
    } else {
      // JSON fallback
      const jsonDb = new JsonFileDatabase('./data');
      const stmt = jsonDb.prepare(text);
      if (text.trim().toUpperCase().startsWith('SELECT')) {
        result = { rows: stmt.all(...params) };
      } else {
        result = stmt.run(...params);
      }
    }
    
    const duration = Date.now() - startTime;
    
    // Track query performance (async, don't wait)
    if (dbType === 'postgres' && duration >= 100) {
      // Import and track asynchronously to avoid blocking
      import('./lib/query-performance-tracker.js').then(module => {
        module.trackQueryPerformance(text, duration, params).catch(err => {
          // Silently fail - don't break queries if tracking fails
          console.warn('[DB] Query tracking error:', err.message);
        });
      });
    }
    
    // Cache SELECT results for 5 minutes
    if (text.trim().toUpperCase().startsWith('SELECT') && result.rows) {
      await cache.set(cacheKey, result, 300000); // 5 minutes
      console.log('[DB CACHE] Cached query result');
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

// Wrap database operations with error handling
async function safeQuery(text, params = []) {
  const retryManager = getRetryManager({
    maxRetries: 3,
    baseDelay: 1000,
    retryCondition: (error) => {
      // Retry on connection errors and timeouts
      return error.code === 'ECONNREFUSED' || 
             error.code === 'ETIMEDOUT' ||
             error.code === 'ENOTFOUND' ||
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

export { DB_PATH, query, pool };

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
  
  // Also set name for compatibility (same as displayName)
  out.name = out.displayName;
  
  return out;
}

export async function listFullClients() {
  const { rows } = await query(`
    SELECT client_key, display_name, timezone, locale,
           numbers_json, twilio_json, vapi_json, calendar_json, sms_templates_json, 
           white_label_config, is_enabled, created_at
    FROM tenants ORDER BY created_at DESC
  `);
  return rows.map(mapTenantRow);
}

// Client cache with 5-minute TTL
const clientCache = new Map();
const CLIENT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function getFullClient(clientKey) {
  // Check cache first
  const cacheKey = `client:${clientKey}`;
  const cached = clientCache.get(cacheKey);
  
  if (cached && Date.now() < cached.expires) {
    return cached.data;
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
  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of clientCache.entries()) {
      if (now >= value.expires) {
        clientCache.delete(key);
      }
    }
  }, 10 * 60 * 1000); // Every 10 minutes
}

export async function upsertFullClient(c) {
  // Invalidate cache before update
  if (c.clientKey) {
    invalidateClientCache(c.clientKey);
  }
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
  
  await query(`
    INSERT INTO calls (
      call_id, client_key, lead_phone, status, outcome, duration, cost, metadata, retry_attempt,
      transcript, recording_url, sentiment, quality_score, objections, key_phrases, metrics, analyzed_at,
      updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, now())
    ON CONFLICT (call_id) 
    DO UPDATE SET 
      status = EXCLUDED.status,
      outcome = EXCLUDED.outcome,
      duration = EXCLUDED.duration,
      cost = EXCLUDED.cost,
      metadata = EXCLUDED.metadata,
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
    callId, clientKey, leadPhone, status, outcome, duration, cost, metadataJson, retryAttempt,
    transcript, recordingUrl, sentiment, qualityScore, objectionsJson, keyPhrasesJson, metricsJson, analyzedAt
  ]);
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

// Get quality metrics for a client
export async function getCallQualityMetrics(clientKey, days = 30) {
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
      AND created_at >= now() - interval '${days} days'
      AND quality_score IS NOT NULL
  `, [clientKey]);
  
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
