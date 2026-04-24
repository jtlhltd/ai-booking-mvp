import { beforeEach, describe, expect, test, jest } from '@jest/globals';
import request from 'supertest';
import { DateTime } from 'luxon';

import { createContractApp } from '../helpers/contract-harness.js';

beforeEach(() => {
  jest.resetModules();
});

describe('routes/demo-dashboard', () => {
  test('happy: GET /api/demo-dashboard/:clientKey returns ok true', async () => {
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

    const { createDemoDashboardRouter, handleDemoDashboard } = await import(
      '../../routes/demo-dashboard.js'
    );

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
});

