export function ensureSqliteCoreSchema(sqlite) {
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

    CREATE TABLE IF NOT EXISTS lead_handoff (
      client_key TEXT NOT NULL,
      phone_match_key TEXT NOT NULL,
      lead_phone TEXT,
      call_id TEXT,
      source TEXT,
      decision_maker TEXT,
      callback_window TEXT,
      summary_text TEXT,
      data_json TEXT,
      operator_notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (client_key, phone_match_key)
    );
    CREATE INDEX IF NOT EXISTS lead_handoff_client_updated_idx ON lead_handoff (client_key, updated_at DESC);
    CREATE INDEX IF NOT EXISTS lead_handoff_client_call_id_idx ON lead_handoff (client_key, call_id);
  `);
}

export function ensureSqliteCallQueueAndQualityAlertsTables(sqlite) {
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
    CREATE INDEX IF NOT EXISTS call_queue_sqlite_client_status_scheduled_idx
      ON call_queue (client_key, status, scheduled_for ASC);
    CREATE INDEX IF NOT EXISTS call_queue_sqlite_client_phone_idx
      ON call_queue (client_key, lead_phone);
    CREATE INDEX IF NOT EXISTS call_queue_sqlite_processing_updated_idx
      ON call_queue (updated_at) WHERE status = 'processing';
    CREATE INDEX IF NOT EXISTS call_queue_sqlite_initiated_call_id_idx
      ON call_queue (initiated_call_id) WHERE initiated_call_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS retry_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_key TEXT NOT NULL,
      lead_phone TEXT NOT NULL,
      retry_type TEXT NOT NULL,
      retry_reason TEXT,
      retry_data TEXT,
      scheduled_for TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      retry_attempt INTEGER DEFAULT 0,
      max_retries INTEGER DEFAULT 3,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (client_key) REFERENCES tenants(client_key) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS retry_queue_sqlite_client_status_scheduled_idx
      ON retry_queue (client_key, status, scheduled_for ASC);
    CREATE INDEX IF NOT EXISTS retry_queue_sqlite_pending_scheduled_idx
      ON retry_queue (scheduled_for ASC) WHERE status = 'pending';
    CREATE INDEX IF NOT EXISTS retry_queue_sqlite_processing_updated_idx
      ON retry_queue (updated_at) WHERE status = 'processing';
    CREATE INDEX IF NOT EXISTS retry_queue_sqlite_client_phone_idx
      ON retry_queue (client_key, lead_phone);
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

    CREATE TABLE IF NOT EXISTS query_performance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query_hash TEXT NOT NULL UNIQUE,
      query_preview TEXT,
      avg_duration REAL,
      max_duration REAL,
      call_count INTEGER DEFAULT 1,
      last_executed_at TEXT DEFAULT (datetime('now')),
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS query_perf_hash_unique_idx ON query_performance(query_hash);
    CREATE INDEX IF NOT EXISTS query_perf_hash_idx ON query_performance(query_hash);
    CREATE INDEX IF NOT EXISTS query_perf_duration_idx ON query_performance(avg_duration DESC);
  `);
}

