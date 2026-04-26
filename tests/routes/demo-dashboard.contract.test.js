import { beforeEach, describe, expect, test, jest } from '@jest/globals';
import request from 'supertest';
import { DateTime } from 'luxon';

import { createContractApp, withIsolatedModulesAndEnv } from '../helpers/contract-harness.js';

beforeEach(() => {
  jest.resetModules();
});

describe('routes/demo-dashboard', () => {
  test('failure: createDemoDashboardRouter returns 500 when handler not wired', async () => {
    await withIsolatedModulesAndEnv(jest, {}, async () => {
      const { createDemoDashboardRouter } = await import('../../routes/demo-dashboard.js');
      const router = createDemoDashboardRouter({});
      const app = createContractApp({ mounts: [{ path: '/api', router }] });
      const res = await request(app).get('/api/demo-dashboard/c1').expect(500);
      expect(res.body).toEqual(expect.objectContaining({ ok: false, error: 'demo_dashboard_handler_not_wired' }));
    });
  });

  test('happy: GET /api/demo-dashboard/:clientKey returns ok true', async () => {
    await withIsolatedModulesAndEnv(jest, {}, async () => {
      jest.unstable_mockModule('../../db.js', () => ({
        inferOutboundAbExperimentName: jest.fn(async () => null),
        getOutboundAbExperimentSummary: jest.fn(async () => null)
      }));
      jest.unstable_mockModule('../../lib/outbound-ab-baseline.js', () => ({
        getVapiAssistantCreativeSnapshot: jest.fn(async () => ({
          voiceId: 'v1',
          firstMessage: 'hi',
          script: 's',
          fetchFailedReason: null
        }))
      }));
      jest.unstable_mockModule('../../lib/outbound-ab-dashboard-enrich.js', () => ({
        enrichOutboundAbDashboardSummariesFromAssistant: jest.fn(async () => {})
      }));
      jest.unstable_mockModule('../../lib/outbound-ab-focus.js', () => ({
        resolveOutboundAbDimensionsForDial: jest.fn(() => []),
        outboundAbDialWarning: jest.fn(() => null)
      }));
      jest.unstable_mockModule('../../lib/outbound-ab-live-results.js', () => ({
        buildOutboundAbLiveResultsPayload: jest.fn(() => ({
          serverTime: new Date().toISOString(),
          minSamplesPerVariant: 50,
          notifyEmailConfigured: false,
          focusExperiment: null,
          reason: 'ok'
        }))
      }));
      jest.unstable_mockModule('../../lib/outbound-ab-review-lock.js', () => ({
        isOutboundAbReviewPending: jest.fn(() => false)
      }));

      const { createDemoDashboardRouter, handleDemoDashboard } = await import('../../routes/demo-dashboard.js');

    const resultsQueue = [
      { rows: [{ total: 0, last24: 0 }] }, // leadCounts
      { rows: [{ // callCounts (bundle)
        total: 0,
        unique_leads_called: 0,
        last24: 0,
        unique_leads_called_last24: 0,
        booked: 0,
        answered: 0,
        not_answered: 0,
        outcome_pending: 0,
        reached_leads: 0,
        no_pickup_only_leads: 0,
        pending_only_leads: 0,
        unique_reached_last24: 0,
        unique_no_pickup_last24: 0
      }] },
      { rows: [] }, // callPhoneStatsAgg (bundle)
      { rows: [{ total: 0, no_shows: 0, cancellations: 0 }] }, // bookingStats
      { rows: [] }, // serviceRows
      { rows: [] }, // apptByServiceRows
      { rows: [] }, // recentCallRows
      { rows: [] }, // responseRows
      { rows: [] }, // touchpointRows
      { rows: [] }, // upcomingAppointmentRows
      { rows: [{ n: 0 }] }, // callQueuePendingRow
      { rows: [{ callable_leads_today: 0, blocked_daily_limit_today: 0 }] }, // callableTodayRow
      { rows: [{ // outreachPulseRows
        last_dial_attempt_at: null,
        attempts_7d: 0,
        attempts_30d: 0,
        unique_called_7d: 0,
        unique_called_30d: 0,
        unique_reached_7d: 0,
        unique_reached_30d: 0
      }] },
      { rows: [{}] }, // outreachQueuePulseRow
      { rows: [{ // usageMetersRow
        calls_7d: 0,
        talk_seconds_7d: 0,
        calls_30d: 0,
        talk_seconds_30d: 0,
        leads_new_30d: 0,
        appointments_30d: 0
      }] },
      { rows: [] } // leadRows (post-Promise.all)
    ];

    const query = jest.fn(async () => {
      if (resultsQueue.length === 0) return { rows: [] };
      return resultsQueue.shift();
    });

    const deps = {
      getFullClient: jest.fn(async () => ({
        displayName: 'Demo',
        booking: { timezone: 'Europe/London' },
        timezone: 'Europe/London',
        vapi: {}
      })),
      activityFeedChannelLabel: jest.fn(() => 'calls'),
      DateTime,
      DASHBOARD_ACTIVITY_TZ: 'Europe/London',
      isPostgres: false,
      query,
      sqlDaysAgo: () => 'NOW()',
      formatTimeAgoLabel: () => '1h',
      formatCallDuration: () => '1m',
      truncateActivityFeedText: () => null,
      formatVapiEndedReasonDisplay: () => null,
      outcomeToFriendlyLabel: () => 'Completed',
      parseCallsRowMetadata: () => ({}),
      isCallQueueStartFailureRow: () => false,
      mapCallStatus: () => 'ended',
      mapStatusClass: () => 'ok',
      trimEnvDashboard: () => '',
      buildDashboardExperience: () => ({ ok: true }),
      sendOperatorAlert: jest.fn(async () => {}),
      fetchImpl: jest.fn(async () => ({ ok: false }))
    };

      const router = createDemoDashboardRouter({
        handleDemoDashboard: (req, res) => handleDemoDashboard(req, res, deps)
      });
      const app = createContractApp({ mounts: [{ path: '/api', router }] });

      const res = await request(app).get('/api/demo-dashboard/c1').expect(200);
      expect(res.body).toEqual(expect.objectContaining({ ok: true, source: 'live' }));
      expect(res.headers['cache-control']).toContain('no-store');
    });
  });

  test('happy: non-empty rows exercise activity/feed mapping + operator alert path', async () => {
    jest.unstable_mockModule('../../db.js', () => ({
      inferOutboundAbExperimentName: jest.fn(async () => 'exp1'),
      getOutboundAbExperimentSummary: jest.fn(async () => ({ ok: true })),
    }));
    jest.unstable_mockModule('../../lib/outbound-ab-baseline.js', () => ({
      getVapiAssistantCreativeSnapshot: jest.fn(async () => ({
        voiceId: 'v1',
        firstMessage: 'hi',
        script: 's',
        fetchFailedReason: null,
      })),
    }));
    jest.unstable_mockModule('../../lib/outbound-ab-dashboard-enrich.js', () => ({
      enrichOutboundAbDashboardSummariesFromAssistant: jest.fn(async () => {}),
    }));
    jest.unstable_mockModule('../../lib/outbound-ab-focus.js', () => ({
      resolveOutboundAbDimensionsForDial: jest.fn(() => ['voice']),
      outboundAbDialWarning: jest.fn(() => 'warn'),
    }));
    jest.unstable_mockModule('../../lib/outbound-ab-live-results.js', () => ({
      buildOutboundAbLiveResultsPayload: jest.fn(() => ({
        serverTime: new Date().toISOString(),
        minSamplesPerVariant: 50,
        notifyEmailConfigured: false,
        focusExperiment: 'exp1',
        reason: 'ok',
      })),
    }));
    jest.unstable_mockModule('../../lib/outbound-ab-review-lock.js', () => ({
      isOutboundAbReviewPending: jest.fn(() => true),
    }));

    const { createDemoDashboardRouter, handleDemoDashboard } = await import('../../routes/demo-dashboard.js');

    const resultsQueue = [
      { rows: [{ total: 5, last24: 1 }] }, // leadCounts
      { rows: [{ total: 5, unique_leads_called: 2, last24: 1, unique_leads_called_last24: 1, booked: 1, answered: 1, not_answered: 1, outcome_pending: 0, reached_leads: 1, no_pickup_only_leads: 1, pending_only_leads: 0, unique_reached_last24: 1, unique_no_pickup_last24: 0 }] }, // callCounts
      { rows: [{ phone_key: '7700900000', calls_n: 2, reached_max: 1 }] }, // callPhoneStatsAgg
      { rows: [{ total: 2, no_shows: 0, cancellations: 0 }] }, // bookingStats
      { rows: [{ service_key: 's1', name: 'Service' }] }, // serviceRows
      { rows: [{ service_key: 's1', n: 1 }] }, // apptByServiceRows
      { rows: [{ id: 1, lead_phone: '+1', status: 'ended', outcome: 'booked', duration: 22, created_at: new Date().toISOString(), metadata: {} }] }, // recentCallRows
      { rows: [{ lead_created: new Date(Date.now() - 3600000).toISOString(), call_created: new Date().toISOString() }] }, // responseRows (lead→call response time)
      { rows: [{ bucket_day: new Date().toISOString(), touchpoints: 2, unique_phones: 1, booked_rows: 1, voicemail_rows: 0, avg_duration_sec: 20, max_duration_sec: 20, unique_reached: 1 }] }, // touchpointRows (daily agg)
      { rows: [{ id: 1, start_iso: new Date(Date.now() + 86400000).toISOString(), status: 'booked' }] }, // upcomingAppointmentRows
      { rows: [{ n: 1 }] }, // callQueuePendingRow
      { rows: [{ callable_leads_today: 1, blocked_daily_limit_today: 0 }] }, // callableTodayRow
      { rows: [{ last_dial_attempt_at: new Date().toISOString(), attempts_7d: 1, attempts_30d: 2, unique_called_7d: 1, unique_called_30d: 2, unique_reached_7d: 1, unique_reached_30d: 2 }] }, // outreachPulseRows
      { rows: [{ n: 1 }] }, // outreachQueuePulseRow
      { rows: [{ calls_7d: 1, talk_seconds_7d: 10, calls_30d: 2, talk_seconds_30d: 20, leads_new_30d: 3, appointments_30d: 1 }] }, // usageMetersRow
      { rows: [{ id: 1, name: 'Lead', phone: '+1', created_at: new Date().toISOString(), service: 's1' }] }, // leadRows
    ];

    const query = jest.fn(async () => (resultsQueue.length ? resultsQueue.shift() : { rows: [] }));

    const deps = {
      getFullClient: jest.fn(async () => ({
        clientKey: 'c1',
        displayName: 'Demo',
        booking: { timezone: 'Europe/London' },
        timezone: 'Europe/London',
        vapi: { outboundAbReviewPending: '1' },
      })),
      activityFeedChannelLabel: jest.fn(() => 'calls'),
      DateTime,
      DASHBOARD_ACTIVITY_TZ: 'Europe/London',
      isPostgres: false,
      query,
      sqlDaysAgo: () => 'NOW()',
      formatTimeAgoLabel: () => '1h',
      formatCallDuration: () => '0:22',
      truncateActivityFeedText: () => null,
      formatVapiEndedReasonDisplay: () => null,
      outcomeToFriendlyLabel: (o) => o,
      parseCallsRowMetadata: () => ({}),
      isCallQueueStartFailureRow: () => false,
      mapCallStatus: () => 'ended',
      mapStatusClass: () => 'ok',
      trimEnvDashboard: () => '',
      buildDashboardExperience: () => ({ ok: true }),
      sendOperatorAlert: jest.fn(async () => {}),
      fetchImpl: jest.fn(async () => {
        throw new Error('fetch failed');
      }),
    };

    const router = createDemoDashboardRouter({
      handleDemoDashboard: (req, res) => handleDemoDashboard(req, res, deps),
    });
    const app = createContractApp({ mounts: [{ path: '/api', router }] });

    const res = await request(app).get('/api/demo-dashboard/c1').expect(200);
    expect(res.body).toEqual(expect.objectContaining({ ok: true, source: 'live' }));
    expect(res.body.recentCalls).toEqual(expect.any(Array));
  });

  test('failure: returns 500 when handler throws', async () => {
    const { createDemoDashboardRouter, handleDemoDashboard } = await import(
      '../../routes/demo-dashboard.js'
    );

    const deps = {
      getFullClient: jest.fn(async () => {
        throw new Error('boom');
      }),
      activityFeedChannelLabel: jest.fn(() => 'calls'),
      DateTime,
      DASHBOARD_ACTIVITY_TZ: 'Europe/London',
      isPostgres: false,
      query: jest.fn(async () => ({ rows: [] })),
      sqlDaysAgo: () => 'NOW()',
      formatTimeAgoLabel: () => '1h',
      formatCallDuration: () => '1m',
      truncateActivityFeedText: () => null,
      formatVapiEndedReasonDisplay: () => null,
      outcomeToFriendlyLabel: () => 'Completed',
      parseCallsRowMetadata: () => ({}),
      isCallQueueStartFailureRow: () => false,
      mapCallStatus: () => 'ended',
      mapStatusClass: () => 'ok',
      trimEnvDashboard: () => '',
      buildDashboardExperience: () => ({ ok: true }),
      sendOperatorAlert: jest.fn(async () => {}),
      fetchImpl: jest.fn(async () => ({ ok: false }))
    };

    const router = createDemoDashboardRouter({
      handleDemoDashboard: (req, res) => handleDemoDashboard(req, res, deps)
    });
    const app = createContractApp({ mounts: [{ path: '/api', router }] });

    const res = await request(app).get('/api/demo-dashboard/c1').expect(500);
    expect(res.body).toEqual(expect.objectContaining({ ok: false }));
  });

  test('happy: brief=1 uses brief caps and still returns ok true', async () => {
    jest.unstable_mockModule('../../db.js', () => ({
      inferOutboundAbExperimentName: jest.fn(async () => null),
      getOutboundAbExperimentSummary: jest.fn(async () => null)
    }));
    jest.unstable_mockModule('../../lib/outbound-ab-baseline.js', () => ({
      getVapiAssistantCreativeSnapshot: jest.fn(async () => ({
        voiceId: '',
        firstMessage: '',
        script: '',
        fetchFailedReason: 'no_vapi_private_key'
      }))
    }));
    jest.unstable_mockModule('../../lib/outbound-ab-dashboard-enrich.js', () => ({
      enrichOutboundAbDashboardSummariesFromAssistant: jest.fn(async () => {})
    }));
    jest.unstable_mockModule('../../lib/outbound-ab-focus.js', () => ({
      resolveOutboundAbDimensionsForDial: jest.fn(() => []),
      outboundAbDialWarning: jest.fn(() => null)
    }));
    jest.unstable_mockModule('../../lib/outbound-ab-live-results.js', () => ({
      buildOutboundAbLiveResultsPayload: jest.fn(() => ({
        serverTime: new Date().toISOString(),
        minSamplesPerVariant: 50,
        notifyEmailConfigured: false,
        focusExperiment: null,
        reason: 'ok'
      }))
    }));
    jest.unstable_mockModule('../../lib/outbound-ab-review-lock.js', () => ({
      isOutboundAbReviewPending: jest.fn(() => false)
    }));

    const { createDemoDashboardRouter, handleDemoDashboard } = await import('../../routes/demo-dashboard.js');

    const resultsQueue = [
      { rows: [{ total: 1, last24: 1 }] }, // leadCounts
      { rows: [{ total: 1, unique_leads_called: 1, last24: 1, unique_leads_called_last24: 1, booked: 0, answered: 0, not_answered: 1, outcome_pending: 0, reached_leads: 0, no_pickup_only_leads: 1, pending_only_leads: 0, unique_reached_last24: 0, unique_no_pickup_last24: 1 }] },
      { rows: [] },
      { rows: [{ total: 0, no_shows: 0, cancellations: 0 }] },
      { rows: [] },
      { rows: [] },
      { rows: [] },
      { rows: [] },
      { rows: [] },
      { rows: [] },
      { rows: [{ n: 0 }] },
      { rows: [{ callable_leads_today: 0, blocked_daily_limit_today: 0 }] },
      { rows: [{ last_dial_attempt_at: null, attempts_7d: 0, attempts_30d: 0, unique_called_7d: 0, unique_called_30d: 0, unique_reached_7d: 0, unique_reached_30d: 0 }] },
      { rows: [{}] },
      { rows: [{ calls_7d: 0, talk_seconds_7d: 0, calls_30d: 0, talk_seconds_30d: 0, leads_new_30d: 0, appointments_30d: 0 }] },
      { rows: [] }
    ];

    const query = jest.fn(async () => (resultsQueue.length ? resultsQueue.shift() : { rows: [] }));

    const deps = {
      getFullClient: jest.fn(async () => ({
        displayName: 'Demo',
        booking: { timezone: 'Europe/London' },
        timezone: 'Europe/London',
        vapi: {}
      })),
      activityFeedChannelLabel: jest.fn(() => 'calls'),
      DateTime,
      DASHBOARD_ACTIVITY_TZ: 'Europe/London',
      isPostgres: false,
      query,
      sqlDaysAgo: () => 'NOW()',
      formatTimeAgoLabel: () => '1h',
      formatCallDuration: () => '1m',
      truncateActivityFeedText: () => null,
      formatVapiEndedReasonDisplay: () => null,
      outcomeToFriendlyLabel: () => 'Completed',
      parseCallsRowMetadata: () => ({}),
      isCallQueueStartFailureRow: () => false,
      mapCallStatus: () => 'ended',
      mapStatusClass: () => 'ok',
      trimEnvDashboard: () => '',
      buildDashboardExperience: () => ({ ok: true }),
      sendOperatorAlert: jest.fn(async () => {}),
      fetchImpl: jest.fn(async () => ({ ok: false }))
    };

    const router = createDemoDashboardRouter({
      handleDemoDashboard: (req, res) => handleDemoDashboard(req, res, deps)
    });
    const app = createContractApp({ mounts: [{ path: '/api', router }] });

    const res = await request(app).get('/api/demo-dashboard/c1?brief=1').expect(200);
    expect(res.body).toEqual(expect.objectContaining({ ok: true }));
  });

  test('happy: isPostgres=true path still returns ok true', async () => {
    jest.unstable_mockModule('../../db.js', () => ({
      inferOutboundAbExperimentName: jest.fn(async () => null),
      getOutboundAbExperimentSummary: jest.fn(async () => null)
    }));
    jest.unstable_mockModule('../../lib/outbound-ab-baseline.js', () => ({
      getVapiAssistantCreativeSnapshot: jest.fn(async () => ({ voiceId: '', firstMessage: '', script: '', fetchFailedReason: 'no_vapi_private_key' }))
    }));
    jest.unstable_mockModule('../../lib/outbound-ab-dashboard-enrich.js', () => ({
      enrichOutboundAbDashboardSummariesFromAssistant: jest.fn(async () => {})
    }));
    jest.unstable_mockModule('../../lib/outbound-ab-focus.js', () => ({
      resolveOutboundAbDimensionsForDial: jest.fn(() => []),
      outboundAbDialWarning: jest.fn(() => null)
    }));
    jest.unstable_mockModule('../../lib/outbound-ab-live-results.js', () => ({
      buildOutboundAbLiveResultsPayload: jest.fn(() => ({ serverTime: new Date().toISOString(), minSamplesPerVariant: 50, notifyEmailConfigured: false, focusExperiment: null, reason: 'ok' }))
    }));
    jest.unstable_mockModule('../../lib/outbound-ab-review-lock.js', () => ({
      isOutboundAbReviewPending: jest.fn(() => false)
    }));

    const { createDemoDashboardRouter, handleDemoDashboard } = await import('../../routes/demo-dashboard.js');
    const resultsQueue = Array.from({ length: 20 }, () => ({ rows: [] }));
    const query = jest.fn(async () => (resultsQueue.length ? resultsQueue.shift() : { rows: [] }));
    const deps = {
      getFullClient: jest.fn(async () => ({ displayName: 'Demo', booking: { timezone: 'Europe/London' }, timezone: 'Europe/London', vapi: {} })),
      activityFeedChannelLabel: jest.fn(() => 'calls'),
      DateTime,
      DASHBOARD_ACTIVITY_TZ: 'Europe/London',
      isPostgres: true,
      query,
      sqlDaysAgo: () => 'NOW()',
      formatTimeAgoLabel: () => '1h',
      formatCallDuration: () => '1m',
      truncateActivityFeedText: () => null,
      formatVapiEndedReasonDisplay: () => null,
      outcomeToFriendlyLabel: () => 'Completed',
      parseCallsRowMetadata: () => ({}),
      isCallQueueStartFailureRow: () => false,
      mapCallStatus: () => 'ended',
      mapStatusClass: () => 'ok',
      trimEnvDashboard: () => '',
      buildDashboardExperience: () => ({ ok: true }),
      sendOperatorAlert: jest.fn(async () => {}),
      fetchImpl: jest.fn(async () => ({ ok: false }))
    };
    const router = createDemoDashboardRouter({ handleDemoDashboard: (req, res) => handleDemoDashboard(req, res, deps) });
    const app = createContractApp({ mounts: [{ path: '/api', router }] });
    const res = await request(app).get('/api/demo-dashboard/c1').expect(200);
    expect(res.body).toEqual(expect.objectContaining({ ok: true }));
  });

  test('failure: a query error yields 500 (degraded behavior is not guaranteed)', async () => {
    jest.unstable_mockModule('../../db.js', () => ({
      inferOutboundAbExperimentName: jest.fn(async () => null),
      getOutboundAbExperimentSummary: jest.fn(async () => null)
    }));
    jest.unstable_mockModule('../../lib/outbound-ab-baseline.js', () => ({
      getVapiAssistantCreativeSnapshot: jest.fn(async () => ({ voiceId: '', firstMessage: '', script: '', fetchFailedReason: 'no_vapi_private_key' }))
    }));
    jest.unstable_mockModule('../../lib/outbound-ab-dashboard-enrich.js', () => ({
      enrichOutboundAbDashboardSummariesFromAssistant: jest.fn(async () => {})
    }));
    jest.unstable_mockModule('../../lib/outbound-ab-focus.js', () => ({
      resolveOutboundAbDimensionsForDial: jest.fn(() => []),
      outboundAbDialWarning: jest.fn(() => null)
    }));
    jest.unstable_mockModule('../../lib/outbound-ab-live-results.js', () => ({
      buildOutboundAbLiveResultsPayload: jest.fn(() => ({ serverTime: new Date().toISOString(), minSamplesPerVariant: 50, notifyEmailConfigured: false, focusExperiment: null, reason: 'ok' }))
    }));
    jest.unstable_mockModule('../../lib/outbound-ab-review-lock.js', () => ({
      isOutboundAbReviewPending: jest.fn(() => false)
    }));

    const { createDemoDashboardRouter, handleDemoDashboard } = await import('../../routes/demo-dashboard.js');

    const resultsQueue = [
      { rows: [{ total: 1, last24: 1 }] }, // leadCounts
      { rows: [{ total: 1, unique_leads_called: 1, last24: 1, unique_leads_called_last24: 1, booked: 0, answered: 0, not_answered: 1, outcome_pending: 0, reached_leads: 0, no_pickup_only_leads: 1, pending_only_leads: 0, unique_reached_last24: 0, unique_no_pickup_last24: 1 }] },
    // Force one mid-stream failure; handler may treat this as fatal.
      { throw: new Error('db down') },
      { rows: [{ total: 0, no_shows: 0, cancellations: 0 }] },
      { rows: [] },
      { rows: [] },
      { rows: [] },
      { rows: [] },
      { rows: [] },
      { rows: [] },
      { rows: [{ n: 0 }] },
      { rows: [{ callable_leads_today: 0, blocked_daily_limit_today: 0 }] },
      { rows: [{ last_dial_attempt_at: null, attempts_7d: 0, attempts_30d: 0, unique_called_7d: 0, unique_called_30d: 0, unique_reached_7d: 0, unique_reached_30d: 0 }] },
      { rows: [{}] },
      { rows: [{ calls_7d: 0, talk_seconds_7d: 0, calls_30d: 0, talk_seconds_30d: 0, leads_new_30d: 0, appointments_30d: 0 }] },
      { rows: [] }
    ];

    const query = jest.fn(async () => {
      const next = resultsQueue.shift();
      if (!next) return { rows: [] };
      if (next.throw) throw next.throw;
      return next;
    });

    const deps = {
      getFullClient: jest.fn(async () => ({ displayName: 'Demo', booking: { timezone: 'Europe/London' }, timezone: 'Europe/London', vapi: {} })),
      activityFeedChannelLabel: jest.fn(() => 'calls'),
      DateTime,
      DASHBOARD_ACTIVITY_TZ: 'Europe/London',
      isPostgres: false,
      query,
      sqlDaysAgo: () => 'NOW()',
      formatTimeAgoLabel: () => '1h',
      formatCallDuration: () => '1m',
      truncateActivityFeedText: () => null,
      formatVapiEndedReasonDisplay: () => null,
      outcomeToFriendlyLabel: () => 'Completed',
      parseCallsRowMetadata: () => ({}),
      isCallQueueStartFailureRow: () => false,
      mapCallStatus: () => 'ended',
      mapStatusClass: () => 'ok',
      trimEnvDashboard: () => '',
      buildDashboardExperience: () => ({ ok: true }),
      sendOperatorAlert: jest.fn(async () => {}),
      fetchImpl: jest.fn(async () => ({ ok: false }))
    };

    const router = createDemoDashboardRouter({
      handleDemoDashboard: (req, res) => handleDemoDashboard(req, res, deps)
    });
    const app = createContractApp({ mounts: [{ path: '/api', router }] });

    const res = await request(app).get('/api/demo-dashboard/c1').expect(500);
    expect(res.body).toEqual(expect.objectContaining({ ok: false }));
  });
});

