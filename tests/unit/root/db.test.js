import { describe, test, expect, jest, beforeEach } from '@jest/globals';

describe('db.js facade (unit)', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  function mockDomains() {
    const fn = () => jest.fn(async () => ({ ok: true }));
    jest.unstable_mockModule('../../../db/domains/outbound-weekday-journey.js', () => ({
      createOutboundWeekdayJourneyDomain: () => ({
        clearOutboundWeekdayJourneyForReopen: fn(),
        hasOutboundWeekdayJourneyDialBlocked: fn(),
        claimOutboundWeekdayJourneySlot: fn(),
        rollbackOutboundWeekdayJourneySlot: fn(),
        closeOutboundWeekdayJourneyOnLivePickup: fn(),
        hasOutboundCallAttemptToday: fn(),
        claimOutboundDialSlotForToday: fn(),
      })
    }));
    jest.unstable_mockModule('../../../db/domains/call-insights.js', () => ({
      createCallInsightsDomain: () => ({
        upsertCallInsights: fn(),
        getLatestCallInsights: fn(),
        getCallAnalyticsFloorIso: jest.fn(async () => null),
      })
    }));
    jest.unstable_mockModule('../../../db/domains/calls.js', () => ({
      createCallsDomain: () => ({
        getCallsByTenant: fn(),
        getCallsByPhone: fn(),
        getRecentCallsCount: fn(),
        getCallQualityMetrics: fn(),
      })
    }));
    jest.unstable_mockModule('../../../db/domains/lead-handoff.js', () => ({
      createLeadHandoffDomain: () => ({
        upsertLeadHandoff: fn(),
        getLeadHandoffByPhone: fn(),
        listLeadHandoff: fn(),
        setOperatorNotes: fn(),
      })
    }));
    jest.unstable_mockModule('../../../db/domains/call-time-bandit.js', () => ({
      createCallTimeBanditDomain: () => ({
        getCallTimeBanditState: fn(),
        getCallTimeBanditForDashboard: fn(),
        backfillCallTimeBanditObservations: fn(),
        recordCallScheduleDecision: fn(),
        recordCallTimeBanditAfterCallComplete: fn(),
      })
    }));
    jest.unstable_mockModule('../../../db/domains/quality-alerts.js', () => ({
      createQualityAlertsDomain: () => ({
        getQualityAlerts: fn(),
        resolveQualityAlert: fn(),
        storeQualityAlert: fn(),
      })
    }));
    jest.unstable_mockModule('../../../db/domains/retry-queue.js', () => ({
      createRetryQueueDomain: () => ({
        addToRetryQueue: fn(),
        getPendingRetries: jest.fn(async () => []),
        updateRetryStatus: fn(),
        getRetriesByPhone: fn(),
        cancelPendingRetries: fn(),
        cancelPendingFollowUps: fn(),
        cleanupOldRetries: fn(),
      })
    }));
    jest.unstable_mockModule('../../../db/domains/api-keys-rate-limit.js', () => ({
      createApiKeysRateLimitDomain: () => ({
        updateApiKeyLastUsed: fn(),
        getApiKeysByClient: fn(),
        checkRateLimit: fn(),
        recordRateLimitRequest: fn(),
        cleanupOldRateLimitRecords: fn(),
      })
    }));
    jest.unstable_mockModule('../../../db/domains/opt-outs.js', () => ({
      createOptOutDomain: () => ({
        listOptOutList: fn(),
        upsertOptOut: fn(),
        deactivateOptOut: fn(),
      })
    }));
    jest.unstable_mockModule('../../../db/domains/call-queue.js', () => ({
      createCallQueueDomain: () => ({
        invalidateOptOutDialCache: jest.fn(),
        addToCallQueue: fn(),
        getPendingCalls: jest.fn(async () => []),
        updateCallQueueStatus: fn(),
        cancelDuplicatePendingCalls: fn(),
        getCallQueueByTenant: fn(),
        getCallQueueByPhone: fn(),
        clearCallQueue: fn(),
        cleanupOldCallQueue: fn(),
        dedupePendingVapiCallQueueRows: fn(),
      })
    }));
  }

  test('getFullClient caches results unless bypassCache=true; invalidateClientCache clears', async () => {
    mockDomains();

    const tenantRow = {
      client_key: 'c1',
      display_name: 'Client 1',
      timezone: 'UTC',
      locale: 'en',
      numbers_json: null,
      twilio_json: null,
      vapi_json: null,
      calendar_json: null,
      sms_templates_json: null,
      white_label_config: null,
      is_enabled: true,
      created_at: new Date().toISOString(),
    };

    const query = jest.fn(async () => ({ rows: [tenantRow] }));
    jest.unstable_mockModule('../../../db/query.js', () => ({
      createQueryRunner: () => ({
        query,
        poolQuerySelect: jest.fn(async () => ({ rows: [] })),
        safeQuery: jest.fn(async () => ({ rows: [] })),
      })
    }));
    jest.unstable_mockModule('../../../db/connection.js', () => ({
      createPostgresPoolAndLimiter: jest.fn(),
      testPostgresPoolConnection: jest.fn(),
    }));
    jest.unstable_mockModule('better-sqlite3', () => ({ default: function Database() {} }));

    // These are imported but not needed for this test; keep as no-ops.
    jest.unstable_mockModule('../../../db/call-queue-reads.js', () => ({}));
    jest.unstable_mockModule('../../../db/call-queue-writes.js', () => ({}));
    jest.unstable_mockModule('../../../db/call-queue-smear.js', () => ({ smearCallQueueScheduledFor: jest.fn() }));

    const db = await import('../../../db.js');

    const a = await db.getFullClient('c1');
    const b = await db.getFullClient('c1');
    expect(a?.clientKey).toBe('c1');
    expect(b?.clientKey).toBe('c1');
    expect(query).toHaveBeenCalledTimes(1);

    const c = await db.getFullClient('c1', { bypassCache: true });
    expect(c?.clientKey).toBe('c1');
    expect(query).toHaveBeenCalledTimes(2);

    db.invalidateClientCache('c1');
    await db.getFullClient('c1');
    expect(query).toHaveBeenCalledTimes(3);
  });
});

