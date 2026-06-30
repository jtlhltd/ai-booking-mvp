export async function ensurePostgresCoreSchema(pool) {
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

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'lead_dial_context_json'
      ) THEN
        ALTER TABLE leads ADD COLUMN lead_dial_context_json JSONB;
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
    -- Catch-up requeue: find failed_q backlog efficiently (indexed dial key, not regexp on lead_phone)
    CREATE INDEX IF NOT EXISTS calls_failed_q_client_phone_created_desc_idx
      ON calls (client_key, lead_phone, created_at DESC)
      WHERE call_id LIKE 'failed_q%';
    CREATE INDEX IF NOT EXISTS calls_failed_q_client_dial_match_key_created_desc_idx
      ON calls (client_key, COALESCE(lead_phone_match_key, '__nodigits__'), created_at DESC)
      WHERE call_id LIKE 'failed_q%';
    CREATE INDEX IF NOT EXISTS calls_client_dial_match_key_success_created_desc_idx
      ON calls (client_key, COALESCE(lead_phone_match_key, '__nodigits__'), created_at DESC)
      WHERE call_id NOT LIKE 'failed_q%';
    CREATE INDEX IF NOT EXISTS calls_failed_q_created_client_idx
      ON calls (created_at DESC, client_key)
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

    -- Structured lead qualification / handoff capture (Tom-first but generalizable).
    -- Stores the latest known structured data per tenant + phone_match_key.
    CREATE TABLE IF NOT EXISTS lead_handoff (
      id BIGSERIAL PRIMARY KEY,
      client_key TEXT NOT NULL REFERENCES tenants(client_key) ON DELETE CASCADE,
      phone_match_key TEXT NOT NULL,
      lead_phone TEXT,
      call_id TEXT,
      source TEXT,
      decision_maker TEXT,
      callback_window TEXT,
      summary_text TEXT,
      data_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      operator_notes TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE (client_key, phone_match_key)
    );
    CREATE INDEX IF NOT EXISTS lead_handoff_client_updated_idx ON lead_handoff (client_key, updated_at DESC);
    CREATE INDEX IF NOT EXISTS lead_handoff_client_call_id_idx ON lead_handoff (client_key, call_id) WHERE call_id IS NOT NULL;

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
    -- Dashboard callable_leads_today: NOT EXISTS call_queue row for same tenant+phone in today's window
    CREATE INDEX IF NOT EXISTS call_queue_client_phone_vapi_active_scheduled_idx
      ON call_queue (client_key, lead_phone, scheduled_for)
      WHERE call_type = 'vapi_call' AND status IN ('pending', 'processing');

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

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'outbound_sequence_json'
      ) THEN
        ALTER TABLE tenants ADD COLUMN outbound_sequence_json JSONB;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'consumer_webhook_json'
      ) THEN
        ALTER TABLE tenants ADD COLUMN consumer_webhook_json JSONB;
      END IF;
    END $$;

    CREATE TABLE IF NOT EXISTS lead_sequence_state (
      id BIGSERIAL PRIMARY KEY,
      client_key TEXT NOT NULL REFERENCES tenants(client_key) ON DELETE CASCADE,
      lead_phone TEXT NOT NULL,
      current_stage_id TEXT NOT NULL,
      stages_completed JSONB NOT NULL DEFAULT '[]'::jsonb,
      attempts_in_stage INTEGER NOT NULL DEFAULT 0,
      attempts_total INTEGER NOT NULL DEFAULT 0,
      started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_call_id TEXT,
      next_stage_scheduled_for TIMESTAMPTZ,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE (client_key, lead_phone)
    );
    CREATE INDEX IF NOT EXISTS lead_sequence_state_client_status_idx
      ON lead_sequence_state (client_key, status);
    CREATE INDEX IF NOT EXISTS lead_sequence_state_client_phone_idx
      ON lead_sequence_state (client_key, lead_phone);
  `);
}

