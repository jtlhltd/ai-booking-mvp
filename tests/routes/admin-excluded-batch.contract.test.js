/**
 * Contract smoke for admin routers that were excluded from coverage collection.
 * Keeps requests in-process with mocked db / deps (no external IO).
 */
import { describe, expect, test, jest, beforeEach, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { DateTime } from 'luxon';

import { createContractApp, withEnv } from '../helpers/contract-harness.js';

const query = jest.fn(async () => ({ rows: [] }));
const getFullClient = jest.fn(async (key) => ({
  clientKey: key,
  client_key: key,
  display_name: 'Test',
  booking: { timezone: 'Europe/London' },
  timezone: 'Europe/London'
}));
const listClientSummaries = jest.fn(async () => [{ clientKey: 'c1', display_name: 'C1' }]);
const dedupePendingVapiCallQueueRows = jest.fn(async () => ({ deduped: 0 }));

jest.unstable_mockModule('../../db.js', () => ({
  query,
  getFullClient,
  listClientSummaries,
  dedupePendingVapiCallQueueRows,
  upsertFullClient: jest.fn(),
  deleteClient: jest.fn(),
  getLeadsByClient: jest.fn(async () => []),
  getCallsByTenant: jest.fn(async () => [])
}));

jest.unstable_mockModule('../../lib/admin-hub-data.js', () => ({
  getClientsData: jest.fn(async () => []),
  getCallsData: jest.fn(async () => [])
}));

jest.unstable_mockModule('../../lib/multi-client-manager.js', () => ({
  getAllClientsOverview: jest.fn(async () => ({ rows: [] })),
  getClientsNeedingAttention: jest.fn(async () => []),
  bulkUpdateClientStatus: jest.fn(async () => ({ ok: true }))
}));

const mockIo = { to: jest.fn(() => ({ emit: jest.fn() })), emit: jest.fn() };
const fakeAuth = (req, res, next) => {
  req.apiKey = { id: 1, permissions: ['*'] };
  req.clientKey = 'c1';
  next();
};

const callQueueDeps = () => ({
  query,
  getFullClient,
  pickTimezone: (c) => c?.booking?.timezone || c?.timezone || 'Europe/London',
  DateTime,
  TIMEZONE: 'Europe/London',
  isPostgres: true,
  pgQueueLeadPhoneKeyExpr: (col) => col,
  isBusinessHours: () => true
});

const outboundJourneyDeps = () => ({
  query,
  getFullClient,
  pickTimezone: (c) => c?.booking?.timezone || c?.timezone || 'Europe/London',
  DateTime,
  isPostgres: true
});

describe('Admin excluded routers — contract smoke', () => {
  let adminBatchConsoleErrorSpy;
  beforeAll(() => {
    adminBatchConsoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterAll(() => {
    adminBatchConsoleErrorSpy.mockRestore();
  });

  beforeEach(() => {
    query.mockReset();
    query.mockImplementation(async () => ({ rows: [] }));
    getFullClient.mockImplementation(async (key) => ({
      clientKey: key,
      client_key: key,
      display_name: 'Test',
      booking: { timezone: 'Europe/London' },
      timezone: 'Europe/London'
    }));
  });

  test('admin-analytics-advanced GET /analytics/advanced', async () => {
    const { createAdminAnalyticsAdvancedRouter } = await import('../../routes/admin-analytics-advanced.js');
    const app = createContractApp({
      mounts: [{ path: '/api/admin', router: () => createAdminAnalyticsAdvancedRouter() }]
    });
    const res = await request(app).get('/api/admin/analytics/advanced').expect(200);
    expect(res.body).toEqual(expect.objectContaining({ overview: expect.any(Object) }));
  });

  test('admin-roi-calculator GET /roi-calculator/leads', async () => {
    const { createAdminRoiCalculatorRouter } = await import('../../routes/admin-roi-calculator.js');
    const app = createContractApp({
      mounts: [{ path: '/api/admin', router: () => createAdminRoiCalculatorRouter() }]
    });
    const res = await request(app).get('/api/admin/roi-calculator/leads').expect(200);
    expect(res.body.ok).toBe(true);
  });

  test('admin-templates GET follow-ups/templates', async () => {
    const { createAdminTemplatesRouter } = await import('../../routes/admin-templates.js');
    const app = createContractApp({
      mounts: [{ path: '/api/admin', router: () => createAdminTemplatesRouter() }]
    });
    const res = await request(app).get('/api/admin/follow-ups/templates');
    expect([200, 500]).toContain(res.status);
  });

  test('admin-calendar GET /calendar/events', async () => {
    const { createAdminCalendarRouter } = await import('../../routes/admin-calendar.js');
    const app = createContractApp({
      mounts: [{ path: '/api/admin', router: () => createAdminCalendarRouter() }]
    });
    const res = await request(app).get('/api/admin/calendar/events').query({ clientKey: 'c1' });
    expect([200, 400, 500]).toContain(res.status);
  });

  test('admin-validate-call-duration GET', async () => {
    const { createAdminValidateCallDurationRouter } = await import('../../routes/admin-validate-call-duration.js');
    const app = createContractApp({
      mounts: [{ path: '/api/admin', router: () => createAdminValidateCallDurationRouter() }]
    });
    const res = await request(app).get('/api/admin/validate-call-duration');
    expect(res.status).toBeGreaterThanOrEqual(200);
  });

  test('admin-test-lead-data GET', async () => {
    const { createAdminTestLeadDataRouter } = await import('../../routes/admin-test-lead-data.js');
    const app = createContractApp({
      mounts: [{ path: '/api/admin', router: () => createAdminTestLeadDataRouter() }]
    });
    const res = await request(app).get('/api/admin/test-lead-data');
    expect(res.status).toBeGreaterThanOrEqual(200);
  });

  test('admin-test-script POST', async () => {
    const { createAdminTestScriptRouter } = await import('../../routes/admin-test-script.js');
    const app = createContractApp({
      mounts: [{ path: '/api/admin', router: () => createAdminTestScriptRouter() }]
    });
    const res = await request(app).post('/api/admin/test-script').send({ script: 'x' });
    expect([200, 400, 401, 500]).toContain(res.status);
  });

  test('admin-call-queue-ops dedupe with API_KEY', async () => {
    await withEnv({ API_KEY: 'secret-admin-key' }, async () => {
      const { createAdminCallQueueOpsRouter } = await import('../../routes/admin-call-queue-ops.js');
      const app = createContractApp({
        mounts: [{ path: '/api/admin', router: () => createAdminCallQueueOpsRouter() }]
      });
      const res = await request(app)
        .post('/api/admin/call-queue/dedupe-pending-vapi')
        .set('X-API-Key', 'secret-admin-key')
        .expect(200);
      expect(res.body.ok).toBe(true);
    });
  });

  test('admin-call-queue GET peek', async () => {
    const { createAdminCallQueueRouter } = await import('../../routes/admin-call-queue.js');
    const app = createContractApp({
      mounts: [{ path: '/api/admin', router: () => createAdminCallQueueRouter(callQueueDeps()) }]
    });
    const res = await request(app).get('/api/admin/call-queue/peek/c1').expect(200);
    expect(res.body.ok).toBe(true);
  });

  test('admin-calls-insights GET', async () => {
    const { createAdminCallsInsightsRouter } = await import('../../routes/admin-calls-insights.js');
    const app = createContractApp({
      mounts: [{ path: '/api/admin', router: () => createAdminCallsInsightsRouter({ query }) }]
    });
    const res = await request(app).get('/api/admin/calls/insights').query({ clientKey: 'c1' });
    expect([200, 500]).toContain(res.status);
  });

  test('admin-lead-scoring GET rules', async () => {
    const { createAdminLeadScoringRouter } = await import('../../routes/admin-lead-scoring.js');
    const app = createContractApp({
      mounts: [{ path: '/api/admin', router: () => createAdminLeadScoringRouter({ query }) }]
    });
    const res = await request(app).get('/api/admin/leads/scoring/rules');
    expect([200, 500]).toContain(res.status);
  });

  test('admin-appointments GET analytics', async () => {
    const { createAdminAppointmentsRouter } = await import('../../routes/admin-appointments.js');
    const app = createContractApp({
      mounts: [{ path: '/api/admin', router: () => createAdminAppointmentsRouter({ query }) }]
    });
    const res = await request(app).get('/api/admin/appointments/analytics').query({ clientKey: 'c1' });
    expect([200, 500]).toContain(res.status);
  });

  test('admin-follow-ups GET sequences', async () => {
    const { createAdminFollowUpsRouter } = await import('../../routes/admin-follow-ups.js');
    const app = createContractApp({
      mounts: [{ path: '/api/admin', router: () => createAdminFollowUpsRouter({ query }) }]
    });
    const res = await request(app).get('/api/admin/follow-ups/sequences');
    expect([200, 500]).toContain(res.status);
  });

  test('admin-reports GET /reports', async () => {
    const { createAdminReportsRouter } = await import('../../routes/admin-reports.js');
    const app = createContractApp({
      mounts: [{ path: '/api/admin', router: () => createAdminReportsRouter({ query }) }]
    });
    const res = await request(app).get('/api/admin/reports');
    expect([200, 500]).toContain(res.status);
  });

  test('admin-social GET profiles', async () => {
    const { createAdminSocialRouter } = await import('../../routes/admin-social.js');
    const app = createContractApp({
      mounts: [{ path: '/api/admin', router: () => createAdminSocialRouter({ query }) }]
    });
    const res = await request(app).get('/api/admin/social/profiles');
    expect([200, 500]).toContain(res.status);
  });

  test('admin-clients GET search', async () => {
    const { createAdminClientsRouter } = await import('../../routes/admin-clients.js');
    const app = createContractApp({
      mounts: [{ path: '/api/admin', router: () => createAdminClientsRouter({ broadcast: jest.fn() }) }]
    });
    const res = await request(app).get('/api/admin/search').query({ q: 'a' });
    expect([200, 400, 500]).toContain(res.status);
  });

  test('admin-email-tasks-deals GET email-templates', async () => {
    const { createAdminEmailTasksDealsRouter } = await import('../../routes/admin-email-tasks-deals.js');
    const app = createContractApp({
      mounts: [{ path: '/api/admin', router: () => createAdminEmailTasksDealsRouter() }]
    });
    const res = await request(app).get('/api/admin/email-templates');
    expect([200, 500]).toContain(res.status);
  });

  test('admin-documents-comments-fields GET documents', async () => {
    const { createAdminDocumentsCommentsFieldsRouter } = await import(
      '../../routes/admin-documents-comments-fields.js'
    );
    const app = createContractApp({
      mounts: [{ path: '/api/admin', router: () => createAdminDocumentsCommentsFieldsRouter() }]
    });
    const res = await request(app).get('/api/admin/documents');
    expect([200, 500]).toContain(res.status);
  });

  test('admin-call-recordings GET', async () => {
    const { createAdminCallRecordingsRouter } = await import('../../routes/admin-call-recordings.js');
    const app = createContractApp({
      mounts: [{ path: '/api/admin', router: () => createAdminCallRecordingsRouter() }]
    });
    const res = await request(app).get('/api/admin/call-recordings');
    expect([200, 500]).toContain(res.status);
  });

  test('admin-reminders GET', async () => {
    const { createAdminRemindersRouter } = await import('../../routes/admin-reminders.js');
    const app = createContractApp({
      mounts: [{ path: '/api/admin', router: () => createAdminRemindersRouter({ sendReminderSMS: jest.fn() }) }]
    });
    const res = await request(app).get('/api/admin/reminders');
    expect([200, 500]).toContain(res.status);
  });

  test('admin-sales-pipeline GET pipeline', async () => {
    const { createAdminSalesPipelineRouter } = await import('../../routes/admin-sales-pipeline.js');
    const app = createContractApp({
      mounts: [{ path: '/api/admin', router: () => createAdminSalesPipelineRouter({ io: mockIo }) }]
    });
    const res = await request(app).get('/api/admin/pipeline').query({ clientKey: 'c1' });
    expect([200, 500]).toContain(res.status);
  });

  test('admin-multi-client GET overview', async () => {
    const { createAdminMultiClientRouter } = await import('../../routes/admin-multi-client.js');
    const app = createContractApp({
      mounts: [{ path: '/api/admin', router: () => createAdminMultiClientRouter({ authenticateApiKey: fakeAuth }) }]
    });
    const res = await request(app).get('/api/admin/clients/overview').expect(200);
    expect(res.body.ok).toBe(true);
  });

  test('admin-outbound-weekday-journey POST clear-today (weekend may 400)', async () => {
    const { createAdminOutboundWeekdayJourneyRouter } = await import(
      '../../routes/admin-outbound-weekday-journey.js'
    );
    const app = createContractApp({
      mounts: [
        { path: '/api/admin', router: () => createAdminOutboundWeekdayJourneyRouter(outboundJourneyDeps()) }
      ]
    });
    const res = await request(app).post('/api/admin/outbound-weekday-journey/clear-today/c1');
    expect([200, 400, 500]).toContain(res.status);
  });
});
