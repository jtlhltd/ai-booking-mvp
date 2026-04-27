import { describe, expect, test, jest, beforeEach } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
  process.env.DB_TYPE = 'sqlite';
  process.env.DATA_DIR = 'data-test';
  process.env.DB_PATH = 'data-test/app.db';
  process.env.JEST_WORKER_ID = '1';
});

function mockSqliteEnv({
  activeOptOutPhones = [],
  retryInsertRow = { id: 1, status: 'pending' },
  pendingRetriesRows = [{ id: 2, status: 'pending' }],
  callQueueExistingRows = [],
  callQueuePendingRowsForCancel = [],
  leadSelectRows = [],
  leadInsertRows = [{ id: 1, client_key: 'c1', phone: '+1', phone_match_key: '1' }],
  appointmentSelectRows = [],
  callsByPhoneRows = [],
  recentCallsCountRows = [{ count: 0 }],
  callQualityMetricsRows = [],
  qualityAlertsRows = [],
  tenantsRows = [],
  callTimeBanditRows = [{ arms: {}, updated_at: null }],
  banditObservationCountRows = [{ c: 0 }],
  banditRecentObsRows = [],
  banditRecentScheduleRows = [],
  banditObservationsLast7DaysRows = [{ c: 0 }],
  callAnalyticsFloorRows = [{ floor_at: new Date('2026-01-01T00:00:00.000Z').toISOString() }],
  latestCallInsightsRows = [],
  activeAbTestsRows = [],
  tenantExistsRow = null,
  tenantByKeyRows = [],
  budgetLimitUpsertRow = { id: 1, budget_type: 'calls', daily_limit: 1 },
  budgetLimitsRows = [{ budget_type: 'calls', daily_limit: 1, weekly_limit: 10, monthly_limit: 100 }],
  totalCostsRow = { total_cost: 5 },
  costAlertInsertRow = { id: 7, status: 'active' },
  activeAlertsRows = [{ id: 7, alert_type: 'calls', threshold: 3, period: 'daily', status: 'active' }],
  analyticsInsertRow = { id: 1, event_type: 'page_view' },
  analyticsEventsRows = [{ id: 1, event_type: 'page_view' }],
  analyticsSummaryRows = [{ event_type: 'page_view', event_category: 'web', event_count: 1 }],
  conversionInsertRow = { id: 1, stage: 'captured' },
  conversionFunnelRows = [{ stage: 'captured', stage_count: 1 }],
  conversionRatesRows = [{ stage: 'captured', conversion_rate: 100 }],
  perfInsertRow = { id: 1, metric_name: 'latency_ms' },
  perfAggRows = [{ metric_name: 'latency_ms', avg_value: 10, sample_count: 1 }],
} = {}) {
  const cache = { get: async () => null, set: async () => {}, clear: async () => {}, delPrefix: async () => {} };
  jest.unstable_mockModule('../../lib/cache.js', () => ({ getCache: () => cache }));

  // db.js creates DATA_DIR / reads config; keep it inert.
  jest.unstable_mockModule('fs', () => ({
    default: { existsSync: () => true, mkdirSync: () => {}, readFileSync: () => '{}', writeFileSync: () => {} },
    existsSync: () => true,
    mkdirSync: () => {},
    readFileSync: () => '{}',
    writeFileSync: () => {}
  }));

  const prepared = [];
  const ran = [];

  jest.unstable_mockModule('better-sqlite3', () => ({
    default: class Database {
      exec(sql) {
        if (sql) ran.push(String(sql));
      }
      transaction(fn) {
        // better-sqlite3 returns a callable wrapper that runs `fn` inside a transaction.
        // For unit/contract tests we only need the callable shape.
        return (...args) => fn(...args);
      }
      prepare(sql) {
        const s = String(sql);
        prepared.push(s);
        return {
          get: (..._args) => {
            if (s.includes('SELECT client_key FROM tenants WHERE client_key=?')) {
              return tenantExistsRow;
            }
            return { id: 123 };
          },
          all: (...args) => {
            // opt-out cache load
            if (s.includes('SELECT phone FROM opt_out_list')) {
              return activeOptOutPhones.map((phone) => ({ phone }));
            }

            // retry queue insert returning
            if (s.includes('INSERT INTO retry_queue')) {
              return [retryInsertRow];
            }

            // pending retries + retries by phone
            if (s.includes('FROM retry_queue')) {
              return pendingRetriesRows;
            }

            // lead lifecycle helpers
            if (s.includes('SELECT * FROM leads')) return leadSelectRows;
            if (s.includes('INSERT INTO leads') && s.includes('RETURNING')) return leadInsertRows;

            // booking helpers
            if (s.includes('SELECT * FROM appointments') && s.includes("status = 'booked'")) return appointmentSelectRows;

            // call tracking + quality
            if (s.includes('FROM calls') && s.includes('WHERE client_key') && s.includes('lead_phone =')) return callsByPhoneRows;
            if (s.includes('SELECT COUNT(*) as count FROM calls')) return recentCallsCountRows;
            if (s.includes('AVG(quality_score)') && s.includes('FROM calls') && s.includes('quality_score IS NOT NULL')) return callQualityMetricsRows;
            if (s.includes('SELECT * FROM quality_alerts')) return qualityAlertsRows;

            // tenant list helpers
            if (s.includes('FROM tenants') && !s.includes('WHERE client_key')) return tenantsRows;
            if (s.includes('FROM tenants') && s.includes('WHERE client_key')) return tenantByKeyRows;

            // call time bandit (dashboard)
            if (s.includes('FROM call_time_bandit WHERE client_key')) return callTimeBanditRows;
            if (s.includes('FROM call_time_bandit_observations') && s.includes('COUNT(*) AS c') && s.includes('LIMIT 40')) {
              return banditRecentObsRows;
            }
            if (s.includes('FROM call_schedule_decisions') && s.includes('LIMIT 30')) {
              return banditRecentScheduleRows;
            }
            if (s.includes('FROM call_time_bandit_observations') && s.includes("NOW() - INTERVAL '7 days'")) {
              return banditObservationsLast7DaysRows;
            }
            if (s.includes('FROM call_time_bandit_observations') && s.includes('COUNT(*) AS c')) {
              return banditObservationCountRows;
            }

            // call analytics floor + insights
            if (s.includes('FROM call_analytics_floor') && s.includes('floor_at')) return callAnalyticsFloorRows;
            if (s.includes('FROM call_insights') && s.includes('LIMIT 1')) return latestCallInsightsRows;

            // outbound A/B tests
            if (s.includes('FROM ab_tests') && s.includes('is_active')) return activeAbTestsRows;

            // budget limits / cost totals / cost alerts
            if (s.includes('INSERT INTO budget_limits')) return [budgetLimitUpsertRow];
            if (s.includes('FROM budget_limits')) return budgetLimitsRows;
            if (s.includes('SUM(amount) as total_cost') && s.includes('FROM cost_tracking')) return [totalCostsRow];
            if (s.includes('INSERT INTO cost_alerts')) return [costAlertInsertRow];
            if (s.includes('FROM cost_alerts') && s.includes("status = 'active'")) return activeAlertsRows;

            // analytics
            if (s.includes('INSERT INTO analytics_events')) return [analyticsInsertRow];
            if (s.includes('FROM analytics_events') && s.includes('GROUP BY event_type')) return analyticsSummaryRows;
            if (s.includes('FROM analytics_events')) return analyticsEventsRows;

            // conversion funnel
            if (s.includes('INSERT INTO conversion_funnel')) return [conversionInsertRow];
            if (s.includes('FROM conversion_funnel') && s.includes('WITH stage_counts')) return conversionRatesRows;
            if (s.includes('FROM conversion_funnel')) return conversionFunnelRows;

            // performance metrics
            if (s.includes('INSERT INTO performance_metrics')) return [perfInsertRow];
            if (s.includes('FROM performance_metrics')) return perfAggRows;

            // addToCallQueue sqlite de-dupe scan
            if (s.includes('SELECT id, scheduled_for, priority, lead_phone FROM call_queue')) {
              return callQueueExistingRows;
            }

            // cancelDuplicatePendingCalls sqlite scan
            if (s.includes('SELECT id, lead_phone FROM call_queue')) {
              // (clientKey, excludeId)
              return callQueuePendingRowsForCancel;
            }

            return [];
          },
          run: (...args) => {
            ran.push(`${s} :: ${JSON.stringify(args)}`);
            return { changes: 1 };
          }
        };
      }
      close() {}
    }
  }));

  // Ensure call-queue keying is deterministic in tests.
  jest.unstable_mockModule('../../lib/lead-phone-key.js', () => {
    function digits(raw) {
      return String(raw || '').replace(/[^\d]/g, '');
    }
    return {
      phoneMatchKey: jest.fn((raw) => {
        const d = digits(raw);
        return d.length >= 10 ? d.slice(-10) : (d || null);
      }),
      pgQueueLeadPhoneKeyExpr: jest.fn(() => 'lead_phone'),
      outboundDialClaimKeyFromRaw: jest.fn((raw) => {
        const d = digits(raw);
        return d ? (d.length >= 10 ? d.slice(-10) : d) : '__nodigits__';
      }),
      phoneMatchKeyExpr: jest.fn(() => 'phone_match_key')
    };
  });

  return { prepared, ran };
}

describe('db.js retry queue + opt-out + call-queue (sqlite) contracts', () => {
  test('retry queue: addToRetryQueue + getPendingRetries + updateRetryStatus + cleanupOldRetries', async () => {
    mockSqliteEnv({
      retryInsertRow: { id: 9, client_key: 'c1', lead_phone: '+447700900000', status: 'pending' },
      pendingRetriesRows: [{ id: 9, status: 'pending' }]
    });

    const db = await import('../../db.js');
    await db.init();

    const inserted = await db.addToRetryQueue({
      clientKey: 'c1',
      leadPhone: '+447700900000',
      retryType: 'vapi_call',
      retryReason: 'follow_up_test',
      retryData: { a: 1 },
      scheduledFor: new Date().toISOString(),
    });
    expect(inserted).toMatchObject({ id: 9, status: 'pending' });

    const pending = await db.getPendingRetries(10, ['vapi_call']);
    expect(Array.isArray(pending)).toBe(true);

    await db.updateRetryStatus(9, 'completed', 2);
    await db.cleanupOldRetries(1);

    await db.closeDatabaseConnectionsForTests();
  });

  test('opt-out list: upsertOptOut + listOptOutList + deactivateOptOut and cache invalidation path', async () => {
    const { prepared } = mockSqliteEnv({
      activeOptOutPhones: ['+447700900000'],
    });

    const db = await import('../../db.js');
    await db.init();

    await expect(db.listOptOutList({ clientKey: '' })).rejects.toMatchObject({ code: 'client_key_required' });
    await expect(db.upsertOptOut({ clientKey: 'c1', phone: 'not-a-phone' })).rejects.toMatchObject({ code: 'invalid_phone' });

    const up = await db.upsertOptOut({ clientKey: 'c1', phone: '+447700900000', reason: 'user_request' });
    expect(up).toEqual({ phone: '+447700900000' });

    await db.listOptOutList({ clientKey: 'c1', q: '7700', activeOnly: true, limit: 5, offset: 0 });
    await db.deactivateOptOut({ clientKey: 'c1', phone: '+447700900000' });

    // Ensure we actually executed the conflict upsert + deactivate UPDATE templates.
    expect(prepared.join('\n')).toMatch(/INSERT INTO opt_out_list/i);
    expect(prepared.join('\n')).toMatch(/UPDATE opt_out_list/i);

    await db.closeDatabaseConnectionsForTests();
  });

  test('call queue sqlite path: addToCallQueue de-dupes existing row and cancelDuplicatePendingCalls cancels matches', async () => {
    const now = new Date('2026-01-01T00:00:00.000Z').toISOString();
    const { prepared } = mockSqliteEnv({
      // Existing pending row to trigger sqlite de-dupe branch inside addToCallQueue
      callQueueExistingRows: [
        { id: 11, scheduled_for: now, priority: 5, lead_phone: '+447700900000' },
      ],
      // Rows for cancelDuplicatePendingCalls: one same, one different
      callQueuePendingRowsForCancel: [
        { id: 21, lead_phone: '+447700900000' },
        { id: 22, lead_phone: '+447700900111' },
      ],
    });

    const db = await import('../../db.js');
    await db.init();

    const row = await db.addToCallQueue({
      clientKey: 'c1',
      leadPhone: '+447700900000',
      priority: 1,
      scheduledFor: new Date('2026-01-01T00:00:01.000Z').toISOString(),
      callType: 'vapi_call',
      callData: { x: 1 }
    });
    expect(row).toBeTruthy();

    const cancelled = await db.cancelDuplicatePendingCalls('c1', '+447700900000', 11);
    expect(cancelled).toBe(1);

    expect(prepared.join('\n')).toMatch(/UPDATE call_queue SET scheduled_for/i);
    expect(prepared.join('\n')).toMatch(/UPDATE call_queue SET status = 'cancelled'/i);

    await db.closeDatabaseConnectionsForTests();
  });

  test('db.js budgets + alerts + analytics + conversion + performance metrics run through sqlite query runner', async () => {
    mockSqliteEnv({
      budgetLimitsRows: [{ budget_type: 'calls', daily_limit: 1, weekly_limit: 10, monthly_limit: 100 }],
      totalCostsRow: { total_cost: 5 },
      activeAlertsRows: [{ id: 7, alert_type: 'calls', threshold: 3, period: 'daily', status: 'active' }],
      analyticsEventsRows: [{ id: 1, event_type: 'page_view' }],
      analyticsSummaryRows: [{ event_type: 'page_view', event_category: 'web', event_count: 1 }],
      conversionFunnelRows: [{ stage: 'captured', stage_count: 1 }],
      conversionRatesRows: [{ stage: 'captured', conversion_rate: 100 }],
      perfAggRows: [{ metric_name: 'latency_ms', metric_category: 'api', avg_value: 10, sample_count: 1 }],
    });

    const db = await import('../../db.js');
    await db.init();

    const budget = await db.setBudgetLimit({
      clientKey: 'c1',
      budgetType: 'calls',
      dailyLimit: 1,
      weeklyLimit: 10,
      monthlyLimit: 100,
    });
    expect(budget).toBeTruthy();

    const exceeded = await db.checkBudgetExceeded('c1', 'calls', 'daily');
    expect(exceeded).toMatchObject({ exceeded: true, current: 5, limit: 1 });

    const triggered = await db.checkCostAlerts('c1');
    expect(triggered.length).toBe(1);

    const ev = await db.trackAnalyticsEvent({
      clientKey: 'c1',
      eventType: 'page_view',
      eventCategory: 'web',
      eventData: { path: '/' },
      sessionId: 's1',
      userAgent: 'ua',
      ipAddress: '127.0.0.1'
    });
    expect(ev).toBeTruthy();
    expect(await db.getAnalyticsEvents('c1', 10)).toHaveLength(1);
    expect(await db.getAnalyticsSummary('c1', 7)).toHaveLength(1);

    expect(
      await db.trackConversionStage({ clientKey: 'c1', leadPhone: '+447700900000', stage: 'captured', stageData: { src: 'web' } })
    ).toBeTruthy();
    expect(await db.getConversionFunnel('c1', 30)).toHaveLength(1);
    expect(await db.getConversionRates('c1', 30)).toHaveLength(1);

    expect(
      await db.recordPerformanceMetric({
        clientKey: 'c1',
        metricName: 'latency_ms',
        metricValue: 10,
        metricUnit: 'ms',
        metricCategory: 'api',
      })
    ).toBeTruthy();
    expect(await db.getPerformanceMetrics('c1', null, 7)).toHaveLength(1);

    await db.closeDatabaseConnectionsForTests();
  });

  test('lead lifecycle helpers: findOrCreateLead + setSmsConsent + storeProposedChoice + markBooked + findExistingBooking', async () => {
    // First SELECT finds none; second SELECT finds existing lead
    const leadRow = { id: 42, client_key: 'c1', name: 'A', phone: '+447700900000', phone_match_key: '7700900000' };
    mockSqliteEnv({
      leadSelectRows: [],
      leadInsertRows: [leadRow],
      appointmentSelectRows: [{ id: 9, client_key: 'c1', lead_id: 42, status: 'booked', start_iso: '2026-01-01T10:00:00.000Z', end_iso: '2026-01-01T10:30:00.000Z' }]
    });

    jest.resetModules();
    process.env.DB_TYPE = 'sqlite';
    process.env.DATA_DIR = 'data-test';
    process.env.DB_PATH = 'data-test/app.db';
    process.env.JEST_WORKER_ID = '1';
    const { prepared, ran } = mockSqliteEnv({
      leadSelectRows: [], // initial
      leadInsertRows: [leadRow],
      appointmentSelectRows: [{ id: 9, client_key: 'c1', lead_id: 42, status: 'booked', start_iso: '2026-01-01T10:00:00.000Z', end_iso: '2026-01-01T10:30:00.000Z' }]
    });

    // Override the mock's all() routing for SELECT * FROM leads to be sequential
    // by injecting a handler via global state: easiest is to assert prepared SQL contains the SELECT we expect
    // and rely on insert+returning path for coverage here.

    const db = await import('../../db.js');
    await db.init();

    const a = await db.findOrCreateLead({ tenantKey: 'c1', phone: '+447700900000', name: 'A', service: 'S', source: 'web' });
    expect(a).toMatchObject({ id: 42, client_key: 'c1', phone: '+447700900000' });

    await db.setSmsConsent('c1', '+447700900000', true);
    await db.storeProposedChoice({ tenantKey: 'c1', phone: '+447700900000', choice: { slot: 'x' } });

    const slot = { start: '2026-01-01T10:00:00.000Z', end: '2026-01-01T10:30:00.000Z' };
    await db.markBooked({ tenantKey: 'c1', leadId: 42, eventId: 'evt1', slot });

    const existing = await db.findExistingBooking({ tenantKey: 'c1', leadId: 42, slot });
    expect(existing).toMatchObject({ id: 9, lead_id: 42, status: 'booked' });

    expect(prepared.join('\n')).toMatch(/INSERT INTO leads/i);
    expect(prepared.join('\n')).toMatch(/UPDATE leads SET consent_sms/i);
    expect(prepared.join('\n')).toMatch(/INSERT INTO messages/i);
    expect(prepared.join('\n')).toMatch(/INSERT INTO appointments/i);
    expect(prepared.join('\n')).toMatch(/SELECT \* FROM appointments/i);

    await db.closeDatabaseConnectionsForTests();
  });

  test('call quality helpers: getCallsByPhone + getRecentCallsCount + getCallQualityMetrics + quality alerts CRUD', async () => {
    mockSqliteEnv({
      callsByPhoneRows: [{ id: 1, call_id: 'c1', client_key: 't1', lead_phone: '+1', status: 'completed' }],
      recentCallsCountRows: [{ count: 7 }],
      callQualityMetricsRows: [
        {
          total_calls: 10,
          successful_calls: 9,
          bookings: 2,
          avg_quality_score: 0.7,
          avg_duration: 33,
          positive_sentiment_count: 6,
          negative_sentiment_count: 1,
          neutral_sentiment_count: 3
        }
      ],
      qualityAlertsRows: [{ id: 3, client_key: 't1', alert_type: 'low_quality', resolved: 0 }]
    });

    const db = await import('../../db.js');
    await db.init();

    const calls = await db.getCallsByPhone('t1', '+1', 5);
    expect(calls).toHaveLength(1);

    expect(await db.getRecentCallsCount('t1', 15)).toBe(7);

    const metrics = await db.getCallQualityMetrics('t1', 30);
    expect(metrics).toMatchObject({ total_calls: 10, bookings: 2 });

    expect(await db.getQualityAlerts('t1', { resolved: false, limit: 10 })).toHaveLength(1);
    await db.storeQualityAlert({
      clientKey: 't1',
      alertType: 'low_quality',
      severity: 'warning',
      metric: 'avg_quality_score',
      actualValue: 0.7,
      expectedValue: 0.85,
      message: 'm',
      action: 'a',
      impact: 'i',
      metadata: { x: 1 }
    });
    await db.resolveQualityAlert(3);

    await db.closeDatabaseConnectionsForTests();
  });

  test('tenant list helpers: listClientSummaries + listFullClients shape', async () => {
    mockSqliteEnv({
      tenantsRows: [
        {
          client_key: 'c1',
          display_name: 'Acme',
          timezone: 'UTC',
          locale: 'en',
          is_enabled: 1,
          created_at: '2026-01-01T00:00:00.000Z',
          vapi_json: { email: 'a@b.test' },
          white_label_config: { industry: 'fitness' },
          numbers_json: { primary: '+1' },
          twilio_json: {},
          calendar_json: {},
          sms_templates_json: {},
        }
      ]
    });

    const db = await import('../../db.js');
    await db.init();

    const summaries = await db.listClientSummaries();
    expect(summaries).toEqual([
      expect.objectContaining({ clientKey: 'c1', displayName: 'Acme', email: 'a@b.test', industry: 'fitness' })
    ]);

    const full = await db.listFullClients();
    expect(full).toHaveLength(1);
    expect(full[0]).toMatchObject({ clientKey: 'c1', displayName: 'Acme' });

    await db.closeDatabaseConnectionsForTests();
  });

  test('call time bandit dashboard: getCallTimeBanditForDashboard returns ranked hours + activity', async () => {
    mockSqliteEnv({
      callTimeBanditRows: [
        {
          arms: {
            // one hour with some observations
            '9': { a: 6, b: 4 },
          },
          updated_at: '2026-01-01T00:00:00.000Z',
        },
      ],
      banditObservationCountRows: [{ c: 10 }],
      banditRecentObsRows: [{ call_id: 'call1', hour: 9, success: 1, created_at: '2026-01-01T00:00:00.000Z' }],
      banditRecentScheduleRows: [
        {
          baseline_at: '2026-01-01T00:00:00.000Z',
          chosen_at: '2026-01-01T00:10:00.000Z',
          source: 'bandit',
          hour_chosen: 9,
          delay_minutes: 10,
          created_at: '2026-01-01T00:00:00.000Z',
        },
      ],
      banditObservationsLast7DaysRows: [{ c: 3 }],
    });

    const db = await import('../../db.js');
    await db.init();

    const out = await db.getCallTimeBanditForDashboard('c1');
    expect(out).toEqual(
      expect.objectContaining({
        ok: true,
        observationCount: 10,
        observationsLast7Days: 3,
        hours: expect.any(Array),
        ranked: expect.any(Array),
        recentActivity: expect.any(Array),
        scheduleAdjustments: expect.any(Array),
      }),
    );
    expect(out.hours).toHaveLength(24);
    expect(out.ranked.length).toBeGreaterThanOrEqual(1);

    await db.closeDatabaseConnectionsForTests();
  });

  test('db.js analytics + insights + outbound weekday + AB test helpers run in sqlite mode', async () => {
    mockSqliteEnv({
      callAnalyticsFloorRows: [{ floor_at: '2025-01-01T00:00:00.000Z' }],
      latestCallInsightsRows: [{ client_key: 'c1', period_days: 30, insights: {}, routing: null, computed_at: '2026-01-01T00:00:00.000Z' }],
      activeAbTestsRows: [{ id: 1, experiment_name: 'exp', variant_name: 'v', variant_config: {}, is_active: 1 }],
    });

    const db = await import('../../db.js');
    await db.init();

    expect(await db.getCallAnalyticsFloorIso()).toMatch(/T/);
    await db.upsertCallInsights({ clientKey: 'c1', periodDays: 30, insights: { ok: true } });
    const latest = await db.getLatestCallInsights('c1');
    expect(latest).toBeTruthy();

    // outbound weekday journey helpers
    await db.claimOutboundDialSlotForToday('c1', '+447700900000', 'Europe/London');
    await db.hasOutboundCallAttemptToday('c1', '+447700900000', 'Europe/London');
    await db.closeOutboundWeekdayJourneyOnLivePickup('c1', '+447700900000');

    // follow-up helper
    await db.cancelPendingFollowUps('c1', '+447700900000');

    // A/B helpers
    const active = await db.getActiveABTests('c1');
    expect(Array.isArray(active)).toBe(true);
    await db.recordABTestResult({ experimentId: 1, clientKey: 'c1', leadPhone: '+1', variantName: 'v', outcome: 'assigned' });

    await db.closeDatabaseConnectionsForTests();
  });

  test('tenant cache + upsert sqlite branches: getFullClient cache/bypassCache and upsertFullClient update vs insert', async () => {
    const tenantRow = {
      client_key: 'c1',
      display_name: 'Acme',
      timezone: 'UTC',
      locale: 'en',
      numbers_json: {},
      twilio_json: {},
      vapi_json: {},
      calendar_json: {},
      sms_templates_json: {},
      white_label_config: { name: 'Acme' },
      is_enabled: 1,
      created_at: '2026-01-01T00:00:00.000Z',
    };

    const { ran } = mockSqliteEnv({
      tenantByKeyRows: [tenantRow],
      tenantExistsRow: { client_key: 'c1' }, // triggers UPDATE branch
    });

    const db = await import('../../db.js');
    await db.init();

    // First fetch hits DB
    const a1 = await db.getFullClient('c1');
    expect(a1).toMatchObject({ clientKey: 'c1', displayName: 'Acme' });

    // Second fetch hits cache (no new SQL required, but we just ensure it returns)
    const a2 = await db.getFullClient('c1');
    expect(a2).toMatchObject({ clientKey: 'c1' });

    // bypassCache forces another SELECT
    await db.getFullClient('c1', { bypassCache: true });

    // Update existing tenant (sqlite UPDATE branch)
    await db.upsertFullClient({ clientKey: 'c1', displayName: 'Acme2', timezone: 'UTC', locale: 'en', numbers: {}, twilio: {}, vapi: {}, calendar: {}, smsTemplates: {}, whiteLabel: {} });

    // Insert new tenant (sqlite INSERT branch)
    jest.resetModules();
    process.env.DB_TYPE = 'sqlite';
    process.env.DATA_DIR = 'data-test';
    process.env.DB_PATH = 'data-test/app.db';
    process.env.JEST_WORKER_ID = '1';
    mockSqliteEnv({
      tenantByKeyRows: [],
      tenantExistsRow: null, // triggers INSERT branch
    });
    const db2 = await import('../../db.js');
    await db2.init();
    await db2.upsertFullClient({ clientKey: 'c2', displayName: 'New', timezone: 'UTC', locale: 'en', numbers: {}, twilio: {}, vapi: {}, calendar: {}, smsTemplates: {}, whiteLabel: {} });
    await db2.deleteClient('c2');

    await db.closeDatabaseConnectionsForTests();
    await db2.closeDatabaseConnectionsForTests();

    expect(ran.join('\n')).toMatch(/UPDATE tenants SET/i);
  });
});

