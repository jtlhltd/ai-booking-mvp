import { describe, expect, test, jest, beforeEach, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';

import { createContractApp, withEnv } from '../helpers/contract-harness.js';
import { requireTenantAccessOrAdmin } from '../../middleware/security.js';
import { createDashboardRouteAuthStubs } from '../helpers/dashboard-route-auth-stubs.js';

const { authenticateApiKey: stubDashboardApiKey } = createDashboardRouteAuthStubs();

beforeEach(() => {
  jest.resetModules();
});

let batch2ConsoleErrorSpy;
beforeAll(() => {
  batch2ConsoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterAll(() => {
  batch2ConsoleErrorSpy.mockRestore();
});

describe('Batch2: next 25 routes (happy + failure)', () => {
  describe('routes/core-api.js', () => {
    test('happy: GET /calls/:callId returns call when clientKey provided', async () => {
      const query = jest.fn(async () => ({
        rows: [
          {
            call_id: 'c_1',
            id: 11,
            lead_phone: '+447700900000',
            status: 'completed',
            outcome: 'ok',
            duration: 10,
            cost: 0,
            transcript: '',
            summary: '',
            created_at: new Date().toISOString(),
            metadata: {}
          }
        ]
      }));
      const { createCoreApiRouter } = await import('../../routes/core-api.js');
      const app = createContractApp({
        mounts: [{ path: '/', router: () => createCoreApiRouter({ query, getIntegrationStatuses: async () => ({}) }) }]
      });
      const res = await request(app).get('/calls/c_1?clientKey=ck').expect(200);
      expect(res.body).toEqual(expect.objectContaining({ ok: true, call: expect.any(Object) }));
    });

    test('failure: GET /calls/:callId requires clientKey', async () => {
      const query = jest.fn(async () => ({ rows: [] }));
      const { createCoreApiRouter } = await import('../../routes/core-api.js');
      const app = createContractApp({
        mounts: [{ path: '/', router: () => createCoreApiRouter({ query, getIntegrationStatuses: async () => ({}) }) }]
      });
      await request(app).get('/calls/x').expect(400);
    });
  });

  describe('routes/daily-summary.js', () => {
    test('happy: demo client returns demo summary without sheets', async () => {
      const { createDailySummaryRouter } = await import('../../routes/daily-summary.js');
      const app = createContractApp({
        mounts: [
          {
            path: '/',
            router: () =>
              createDailySummaryRouter({
                getFullClient: async () => ({}),
                resolveLogisticsSpreadsheetId: () => null,
                sheets: {},
                isPostgres: false,
                poolQuerySelect: async () => ({ rows: [{ n: 0 }] }),
                query: async () => ({ rows: [{ n: 0 }] }),
                pickTimezone: () => 'Europe/London',
                authenticateApiKey: stubDashboardApiKey,
                requireTenantAccessOrAdmin
              })
          }
        ]
      });
      const res = await request(app).get('/daily-summary/demo_client').expect(200);
      expect(res.body).toEqual(expect.objectContaining({ ok: true, demo: true }));
    });

    test('failure: returns 502 when sheets read throws for configured client', async () => {
      const sheets = {
        ensureLogisticsHeader: jest.fn(async () => {}),
        readSheet: jest.fn(async () => {
          throw new Error('sheet down');
        }),
        logisticsSheetRowsToRecords: () => []
      };
      const { createDailySummaryRouter } = await import('../../routes/daily-summary.js');
      const app = createContractApp({
        mounts: [
          {
            path: '/',
            router: () =>
              createDailySummaryRouter({
                getFullClient: async () => ({ clientKey: 'c1' }),
                resolveLogisticsSpreadsheetId: () => 'sheet_1',
                sheets,
                isPostgres: false,
                poolQuerySelect: async () => ({ rows: [{ n: 0 }] }),
                query: async () => ({ rows: [{ n: 0 }] }),
                pickTimezone: () => 'Europe/London',
                authenticateApiKey: stubDashboardApiKey,
                requireTenantAccessOrAdmin
              })
          }
        ]
      });
      await request(app).get('/daily-summary/c1').expect(502);
    });
  });

  describe('routes/ops-health-and-dnc.js', () => {
    test('happy: GET /ops/health/:clientKey returns ok true', async () => {
      const { createOpsHealthAndDncRouter } = await import('../../routes/ops-health-and-dnc.js');
      const app = createContractApp({
        mounts: [
          {
            path: '/',
            router: () =>
              createOpsHealthAndDncRouter({
                getFullClient: async () => ({}),
                resolveLogisticsSpreadsheetId: () => 'sheet_1',
                listOptOutList: async () => [],
                upsertOptOut: async () => ({ phone: '+44' }),
                deactivateOptOut: async () => ({ phone: '+44' }),
                query: async () => ({ rows: [{ n: 0 }] }),
                dbType: 'postgres',
                DB_PATH: 'x',
                authenticateApiKey: stubDashboardApiKey,
                requireTenantAccessOrAdmin
              })
          }
        ]
      });
      const res = await request(app).get('/ops/health/c1').expect(200);
      expect(res.body).toEqual(expect.objectContaining({ ok: true, dnc: expect.any(Object) }));
    });

    test('failure: GET /dnc/list requires clientKey query', async () => {
      const { createOpsHealthAndDncRouter } = await import('../../routes/ops-health-and-dnc.js');
      const app = createContractApp({
        mounts: [
          {
            path: '/',
            router: () =>
              createOpsHealthAndDncRouter({
                listOptOutList: async () => [],
                query: async () => ({ rows: [{ n: 0 }] }),
                dbType: 'postgres',
                DB_PATH: 'x',
                getFullClient: async () => ({}),
                resolveLogisticsSpreadsheetId: () => null,
                upsertOptOut: async () => ({}),
                deactivateOptOut: async () => ({}),
                authenticateApiKey: stubDashboardApiKey,
                requireTenantAccessOrAdmin
              })
          }
        ]
      });
      await request(app).get('/dnc/list').expect(400);
    });
  });

  describe('routes/sms-templates.js', () => {
    test('happy: GET /sms/templates returns templates when authed', async () => {
      jest.unstable_mockModule('../../lib/sms-template-library.js', () => ({
        listTemplates: () => [{ key: 'k1' }]
      }));
      const { createSmsTemplatesRouter } = await import('../../routes/sms-templates.js');
      const app = createContractApp({
        mounts: [{ path: '/', router: () => createSmsTemplatesRouter({ authenticateApiKey: (_req, _res, next) => next() }) }]
      });
      const res = await request(app).get('/sms/templates').expect(200);
      expect(res.body).toEqual(expect.objectContaining({ ok: true, count: 1 }));
    });

    test('failure: POST /sms/templates/render rejects missing templateKey', async () => {
      const { createSmsTemplatesRouter } = await import('../../routes/sms-templates.js');
      const app = createContractApp({
        mounts: [{ path: '/', router: () => createSmsTemplatesRouter({ authenticateApiKey: (_req, _res, next) => next() }) }]
      });
      await request(app).post('/sms/templates/render').send({}).expect(400);
    });
  });

  describe('routes/reports.js', () => {
    test('happy: GET /reports/:clientKey returns ok true', async () => {
      jest.unstable_mockModule('../../lib/automated-reporting.js', () => ({
        generateClientReport: jest.fn(async () => ({ ok: true }))
      }));
      const { createReportsRouter } = await import('../../routes/reports.js');
      const app = createContractApp({
        mounts: [{ path: '/', router: () => createReportsRouter({ authenticateApiKey: (_req, _res, next) => next() }) }]
      });
      const res = await request(app).get('/reports/c1').expect(200);
      expect(res.body).toEqual(expect.objectContaining({ ok: true, report: expect.any(Object) }));
    });

    test('failure: GET /reports/:clientKey returns 404 when report.error set', async () => {
      jest.unstable_mockModule('../../lib/automated-reporting.js', () => ({
        generateClientReport: jest.fn(async () => ({ error: 'missing' }))
      }));
      const { createReportsRouter } = await import('../../routes/reports.js');
      const app = createContractApp({
        mounts: [{ path: '/', router: () => createReportsRouter({ authenticateApiKey: (_req, _res, next) => next() }) }]
      });
      await request(app).get('/reports/c1').expect(404);
    });
  });

  describe('routes/recordings-quality-check.js', () => {
    test('happy: GET /recordings/quality-check/:clientKey returns checks', async () => {
      globalThis.fetch = jest.fn(async () => ({ ok: true, status: 200 }));
      const query = jest.fn(async () => ({ rows: [{ call_id: 'c', recording_url: 'https://x', created_at: new Date().toISOString() }] }));
      const { createRecordingsQualityCheckRouter } = await import('../../routes/recordings-quality-check.js');
      const app = createContractApp({ mounts: [{ path: '/', router: () => createRecordingsQualityCheckRouter({ query }) }] });
      const res = await request(app).get('/recordings/quality-check/c1').expect(200);
      expect(res.body).toEqual(expect.objectContaining({ ok: true, checks: expect.any(Array) }));
    });

    test('failure: returns 500 when query throws', async () => {
      const query = jest.fn(async () => {
        throw new Error('db');
      });
      const { createRecordingsQualityCheckRouter } = await import('../../routes/recordings-quality-check.js');
      const app = createContractApp({ mounts: [{ path: '/', router: () => createRecordingsQualityCheckRouter({ query }) }] });
      await request(app).get('/recordings/quality-check/c1').expect(500);
    });
  });

  describe('routes/call-recordings-stream.js', () => {
    test('happy: streams bytes when recording exists', async () => {
      const poolQuerySelect = jest.fn(async () => ({ rows: [{ recording_url: 'https://example/audio.mp3' }] }));
      globalThis.fetch = jest.fn(async () => ({
        ok: true,
        status: 200,
        headers: { get: (k) => (String(k).toLowerCase() === 'content-type' ? 'audio/mpeg' : null) },
        body: null,
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer
      }));
      const { createCallRecordingsStreamRouter } = await import('../../routes/call-recordings-stream.js');
      const app = createContractApp({ mounts: [{ path: '/', router: () => createCallRecordingsStreamRouter({ poolQuerySelect }) }] });
      await request(app).get('/call-recordings/c1/stream/1').expect(200);
    });

    test('failure: returns 400 for invalid recording id', async () => {
      const poolQuerySelect = jest.fn(async () => ({ rows: [] }));
      const { createCallRecordingsStreamRouter } = await import('../../routes/call-recordings-stream.js');
      const app = createContractApp({ mounts: [{ path: '/', router: () => createCallRecordingsStreamRouter({ poolQuerySelect }) }] });
      await request(app).get('/call-recordings/c1/stream/not-a-number').expect(400);
    });
  });

  describe('routes/voicemails.js', () => {
    test('happy: GET /voicemails/:clientKey returns ok true', async () => {
      const poolQuerySelect = jest.fn(async () => ({ rows: [{ n: 0 }] }));
      const { createVoicemailsRouter } = await import('../../routes/voicemails.js');
      const app = createContractApp({
        mounts: [
          {
            path: '/',
            router: () =>
              createVoicemailsRouter({
                isPostgres: false,
                poolQuerySelect,
                formatTimeAgoLabel: () => 'x',
                truncateActivityFeedText: (s) => s
              })
          }
        ]
      });
      const res = await request(app).get('/voicemails/c1').expect(200);
      expect(res.body).toEqual(expect.objectContaining({ ok: true, voicemails: expect.any(Array) }));
    });

    test('failure: returns 500 when poolQuerySelect throws', async () => {
      const poolQuerySelect = jest.fn(async () => {
        throw new Error('db');
      });
      const { createVoicemailsRouter } = await import('../../routes/voicemails.js');
      const app = createContractApp({
        mounts: [
          {
            path: '/',
            router: () =>
              createVoicemailsRouter({
                isPostgres: false,
                poolQuerySelect,
                formatTimeAgoLabel: () => 'x',
                truncateActivityFeedText: (s) => s
              })
          }
        ]
      });
      await request(app).get('/voicemails/c1').expect(500);
    });
  });

  describe('routes/call-recordings.js', () => {
    test('happy: returns recordings list', async () => {
      const query = jest.fn(async (sql) => (String(sql).includes('COUNT') ? { rows: [{ n: 0 }] } : { rows: [] }));
      const { createCallRecordingsRouter } = await import('../../routes/call-recordings.js');
      const app = createContractApp({
        mounts: [{ path: '/', router: () => createCallRecordingsRouter({ query, formatTimeAgoLabel: () => 'x' }) }]
      });
      const res = await request(app).get('/call-recordings/c1').expect(200);
      expect(res.body).toEqual(expect.objectContaining({ ok: true, recordings: expect.any(Array) }));
    });

    test('failure: returns 500 when query throws', async () => {
      const query = jest.fn(async () => {
        throw new Error('db');
      });
      const { createCallRecordingsRouter } = await import('../../routes/call-recordings.js');
      const app = createContractApp({
        mounts: [{ path: '/', router: () => createCallRecordingsRouter({ query, formatTimeAgoLabel: () => 'x' }) }]
      });
      await request(app).get('/call-recordings/c1').expect(500);
    });
  });

  describe('routes/next-actions.js', () => {
    test('happy: returns action list', async () => {
      const query = jest.fn(async () => ({ rows: [{ count: 2 }] }));
      const { createNextActionsRouter } = await import('../../routes/next-actions.js');
      const app = createContractApp({
        mounts: [{ path: '/', router: () => createNextActionsRouter({ query, cacheMiddleware: () => (_req, _res, next) => next() }) }]
      });
      const res = await request(app).get('/next-actions/c1').expect(200);
      expect(res.body).toEqual(expect.objectContaining({ ok: true, actions: expect.any(Array) }));
    });

    test('failure: returns 500 when query throws', async () => {
      const query = jest.fn(async () => {
        throw new Error('db');
      });
      const { createNextActionsRouter } = await import('../../routes/next-actions.js');
      const app = createContractApp({
        mounts: [{ path: '/', router: () => createNextActionsRouter({ query, cacheMiddleware: () => (_req, _res, next) => next() }) }]
      });
      await request(app).get('/next-actions/c1').expect(500);
    });
  });

  describe('routes/follow-up-queue.js', () => {
    test('happy: demo client returns demo rows', async () => {
      const { createFollowUpQueueRouter } = await import('../../routes/follow-up-queue.js');
      const app = createContractApp({
        mounts: [{ path: '/', router: () => createFollowUpQueueRouter({ getFullClient: async () => ({}), resolveLogisticsSpreadsheetId: () => null, sheets: {} }) }]
      });
      const res = await request(app).get('/follow-up-queue/demo_client').expect(200);
      expect(res.body).toEqual(expect.objectContaining({ ok: true, demo: true, rows: expect.any(Array) }));
    });

    test('failure: status endpoint rejects invalid row', async () => {
      const { createFollowUpQueueRouter } = await import('../../routes/follow-up-queue.js');
      const app = createContractApp({
        mounts: [{ path: '/', router: () => createFollowUpQueueRouter({ getFullClient: async () => ({}), resolveLogisticsSpreadsheetId: () => 'sheet', sheets: {} }) }]
      });
      await request(app).post('/follow-up-queue/c1/status').send({ row: 1 }).expect(400);
    });
  });

  describe('routes/retry-queue.js', () => {
    test('happy: GET /retry-queue/:clientKey returns ok true', async () => {
      jest.unstable_mockModule('../../db.js', () => ({ updateRetryStatus: jest.fn(async () => {}) }));
      const { createRetryQueueRouter } = await import('../../routes/retry-queue.js');
      const app = createContractApp({
        mounts: [
          {
            path: '/',
            router: () =>
              createRetryQueueRouter({
                poolQuerySelect: async () => ({ rows: [{ rq_pending: 0, rq_failed: 0, rq_cancelled: 0, cq_pending: 0 }] }),
                query: async () => ({ rows: [{ id: 1, retry_type: 'sheet_patch', retry_data: JSON.stringify({ rowNumber: 2, patch: { x: 1 } }) }] }),
                getFullClient: async () => ({}),
                fetchLeadNamesForRetryQueuePhones: async () => new Map(),
                effectiveDialScheduledForApiDisplay: () => new Date(),
                resolveLogisticsSpreadsheetId: () => 'sheet',
                sheets: { patchLogisticsRowByNumber: async () => true }
              })
          }
        ]
      });
      const res = await request(app).get('/retry-queue/c1').expect(200);
      expect(res.body).toEqual(expect.objectContaining({ ok: true, retries: expect.any(Array) }));
    });

    test('failure: POST /retry-queue/:clientKey/run rejects invalid id', async () => {
      jest.unstable_mockModule('../../db.js', () => ({ updateRetryStatus: jest.fn(async () => {}) }));
      const { createRetryQueueRouter } = await import('../../routes/retry-queue.js');
      const app = createContractApp({
        mounts: [{ path: '/', router: () => createRetryQueueRouter({ query: async () => ({ rows: [] }) }) }]
      });
      await request(app).post('/retry-queue/c1/run').send({ id: 'nope' }).expect(400);
    });
  });

  describe('routes/call-time-bandit.js', () => {
    test('happy: returns bandit data', async () => {
      jest.unstable_mockModule('../../db.js', () => ({
        getCallTimeBanditForDashboard: jest.fn(async () => ({ ok: true, observationCount: 1 })),
        backfillCallTimeBanditObservations: jest.fn(async () => {})
      }));
      const { createCallTimeBanditRouter } = await import('../../routes/call-time-bandit.js');
      const app = createContractApp({ mounts: [{ path: '/', router: () => createCallTimeBanditRouter() }] });
      const res = await request(app).get('/call-time-bandit/c1').expect(200);
      expect(res.body).toEqual(expect.objectContaining({ ok: true, thompsonActive: expect.any(Boolean) }));
    });

    test('failure: returns 500 when db throws', async () => {
      jest.unstable_mockModule('../../db.js', () => ({
        getCallTimeBanditForDashboard: jest.fn(async () => {
          throw new Error('db');
        }),
        backfillCallTimeBanditObservations: jest.fn(async () => {})
      }));
      const { createCallTimeBanditRouter } = await import('../../routes/call-time-bandit.js');
      const app = createContractApp({ mounts: [{ path: '/', router: () => createCallTimeBanditRouter() }] });
      await request(app).get('/call-time-bandit/c1').expect(500);
    });
  });

  describe('routes/import-lead-email.js', () => {
    test('happy: imports lead when parsed lead has phone', async () => {
      jest.unstable_mockModule('../../db.js', () => ({ findOrCreateLead: jest.fn(async () => ({ id: 1 })) }));
      jest.unstable_mockModule('../../lib/lead-import.js', () => ({ parseEmailForLead: () => ({ name: 'A', phone: '+44', service: '' }) }));
      jest.unstable_mockModule('../../lib/lead-deduplication.js', () => ({ processBulkLeads: jest.fn(async () => ({ valid: 1, duplicates: 0 })) }));
      const { createImportLeadEmailRouter } = await import('../../routes/import-lead-email.js');
      const app = createContractApp({ mounts: [{ path: '/', router: () => createImportLeadEmailRouter() }] });
      const res = await request(app).post('/import-lead-email/c1').send({ emailBody: 'x' }).expect(200);
      expect(res.body).toEqual(expect.objectContaining({ ok: true, lead: expect.any(Object) }));
    });

    test('failure: rejects missing emailBody', async () => {
      const { createImportLeadEmailRouter } = await import('../../routes/import-lead-email.js');
      const app = createContractApp({ mounts: [{ path: '/', router: () => createImportLeadEmailRouter() }] });
      await request(app).post('/import-lead-email/c1').send({}).expect(400);
    });
  });

  describe('routes/import-leads.js', () => {
    test('happy: imports leads and returns ok true', async () => {
      jest.unstable_mockModule('../../lib/lead-import.js', () => ({
        parseCSV: () => [{ phone: '+44', decisionMaker: 'A' }],
        importLeads: jest.fn(async () => ({ imported: 1 }))
      }));
      jest.unstable_mockModule('../../lib/notifications.js', () => ({ notifyLeadUpload: jest.fn(async () => {}) }));
      jest.unstable_mockModule('../../lib/lead-intelligence.js', () => ({ calculateLeadScore: () => 10 }));
      jest.unstable_mockModule('../../lib/lead-deduplication.js', () => ({
        bulkProcessLeads: jest.fn(async () => ({ valid: 1, invalid: 0, duplicates: 0, optedOut: 0, validLeads: [{ phone: '+44' }], invalidLeads: [] }))
      }));
      const { createImportLeadsRouter } = await import('../../routes/import-leads.js');
      const app = createContractApp({
        mounts: [{ path: '/', router: () => createImportLeadsRouter({ getFullClient: async () => ({}), isBusinessHours: () => false }) }]
      });
      const res = await request(app).post('/import-leads/c1').send({ csvData: 'x' }).expect(200);
      expect(res.body).toEqual(expect.objectContaining({ ok: true }));
    });

    test('failure: rejects missing csvData', async () => {
      const { createImportLeadsRouter } = await import('../../routes/import-leads.js');
      const app = createContractApp({
        mounts: [{ path: '/', router: () => createImportLeadsRouter({ getFullClient: async () => ({}), isBusinessHours: () => false }) }]
      });
      await request(app).post('/import-leads/c1').send({}).expect(400);
    });
  });

  describe('routes/create-client.js', () => {
    test('happy: creates client with correct X-API-Key', async () => {
      const { createCreateClientRouter } = await import('../../routes/create-client.js');
      const app = createContractApp({
        mounts: [{ path: '/', router: () => createCreateClientRouter({ upsertFullClient: async () => ({}), adjustColorBrightness: () => '#000000' }) }]
      });
      await withEnv({ API_KEY: 'k' }, async () => {
        const res = await request(app)
          .post('/create-client')
          .set('X-API-Key', 'k')
          .send({ basic: { clientName: 'Acme', industry: 'x' } })
          .expect(200);
        expect(res.body).toEqual(expect.objectContaining({ ok: true, clientKey: expect.any(String) }));
      });
    });

    test('failure: rejects unauthorized without correct key', async () => {
      const { createCreateClientRouter } = await import('../../routes/create-client.js');
      const app = createContractApp({
        mounts: [{ path: '/', router: () => createCreateClientRouter({ upsertFullClient: async () => ({}), adjustColorBrightness: () => '#000000' }) }]
      });
      await withEnv({ API_KEY: 'k' }, async () => {
        await request(app).post('/create-client').send({ basic: { clientName: 'Acme' } }).expect(401);
      });
    });
  });

  describe('routes/available-slots.js', () => {
    test('happy: returns slots when bookingSystem available', async () => {
      const { createAvailableSlotsRouter } = await import('../../routes/available-slots.js');
      const app = createContractApp({
        mounts: [{ path: '/', router: () => createAvailableSlotsRouter({ bookingSystem: { generateTimeSlots: () => [{ id: 1 }] } }) }]
      });
      const res = await request(app).get('/available-slots').expect(200);
      expect(res.body).toEqual(expect.objectContaining({ success: true, totalSlots: 1 }));
    });

    test('failure: returns 503 when bookingSystem missing', async () => {
      const { createAvailableSlotsRouter } = await import('../../routes/available-slots.js');
      const app = createContractApp({ mounts: [{ path: '/', router: () => createAvailableSlotsRouter({}) }] });
      await request(app).get('/available-slots').expect(503);
    });
  });

  describe('routes/book-demo.js', () => {
    test('happy: books demo when bookingSystem exists', async () => {
      const { createBookDemoRouter } = await import('../../routes/book-demo.js');
      const app = createContractApp({
        mounts: [{ path: '/', router: () => createBookDemoRouter({ bookingSystem: { generateTimeSlots: () => [], bookDemo: async () => ({ success: true }) } }) }]
      });
      const res = await request(app).post('/book-demo').send({ name: 'A', email: 'a@b.com' }).expect(200);
      expect(res.body).toEqual(expect.objectContaining({ success: true }));
    });

    test('failure: rejects missing name/email', async () => {
      const { createBookDemoRouter } = await import('../../routes/book-demo.js');
      const app = createContractApp({
        mounts: [{ path: '/', router: () => createBookDemoRouter({ bookingSystem: { generateTimeSlots: () => [], bookDemo: async () => ({}) } }) }]
      });
      await request(app).post('/book-demo').send({}).expect(400);
    });
  });

  describe('routes/import-leads-csv.js', () => {
    test('happy: processes leads array', async () => {
      const requireApiKey = (_req, _res, next) => next();
      globalThis.fetch = jest.fn(async () => ({ json: async () => ({ success: true, leadId: 1 }) }));
      const { createImportLeadsCsvRouter } = await import('../../routes/import-leads-csv.js');
      const app = createContractApp({ mounts: [{ path: '/', router: () => createImportLeadsCsvRouter({ requireApiKey }) }] });
      const res = await request(app)
        .post('/import-leads-csv')
        .set('X-API-Key', 'k')
        .send({ leads: [{ phoneNumber: '+44', decisionMaker: 'A' }] })
        .expect(200);
      expect(res.body).toEqual(expect.objectContaining({ success: true, results: expect.any(Object) }));
    });

    test('failure: rejects empty leads array', async () => {
      const requireApiKey = (_req, _res, next) => next();
      const { createImportLeadsCsvRouter } = await import('../../routes/import-leads-csv.js');
      const app = createContractApp({ mounts: [{ path: '/', router: () => createImportLeadsCsvRouter({ requireApiKey }) }] });
      await request(app).post('/import-leads-csv').set('X-API-Key', 'k').send({ leads: [] }).expect(400);
    });
  });

  describe('routes/zapier-webhook.js', () => {
    test('happy: accepts lead when client and phone present', async () => {
      jest.unstable_mockModule('../../lib/lead-deduplication.js', () => ({
        processBulkLeads: jest.fn(async () => ({ valid: 1, invalid: 0 }))
      }));
      const { createZapierWebhookRouter } = await import('../../routes/zapier-webhook.js');
      const app = createContractApp({
        mounts: [
          {
            path: '/',
            router: () =>
              createZapierWebhookRouter({
                requireApiKey: (_req, _res, next) => next(),
                getClientFromHeader: async () => ({ clientKey: 'c1' })
              })
          }
        ]
      });
      const res = await request(app).post('/zapier').set('X-API-Key', 'k').set('X-Client-Key', 'c1').send({ phone: '+44' }).expect(200);
      expect(res.body).toEqual(expect.objectContaining({ success: true }));
    });

    test('failure: rejects missing phone', async () => {
      const { createZapierWebhookRouter } = await import('../../routes/zapier-webhook.js');
      const app = createContractApp({
        mounts: [
          {
            path: '/',
            router: () =>
              createZapierWebhookRouter({
                requireApiKey: (_req, _res, next) => next(),
                getClientFromHeader: async () => ({ clientKey: 'c1' })
              })
          }
        ]
      });
      await request(app).post('/zapier').set('X-API-Key', 'k').set('X-Client-Key', 'c1').send({}).expect(400);
    });
  });

  describe('routes/vapi-dev.js', () => {
    test('happy: /test-vapi returns success=false when key missing', async () => {
      const { createVapiDevRouter } = await import('../../routes/vapi-dev.js');
      const app = createContractApp({ mounts: [{ path: '/', router: () => createVapiDevRouter() }] });
      const res = await request(app).get('/test-vapi').expect(200);
      expect(res.body).toEqual(expect.objectContaining({ success: false }));
    });

    test('failure: /create-assistant returns 500 when key missing', async () => {
      const { createVapiDevRouter } = await import('../../routes/vapi-dev.js');
      const app = createContractApp({ mounts: [{ path: '/', router: () => createVapiDevRouter() }] });
      await request(app).get('/create-assistant').expect(500);
    });
  });

  describe('routes/sms-email-pipeline.js', () => {
    test('happy: /sms-test returns success true', async () => {
      const { createSmsEmailPipelineRouter } = await import('../../routes/sms-email-pipeline.js');
      const app = createContractApp({ mounts: [{ path: '/', router: () => createSmsEmailPipelineRouter({}) }] });
      const res = await request(app).get('/sms-test').expect(200);
      expect(res.body).toEqual(expect.objectContaining({ success: true }));
    });

    test('failure: /api/initiate-lead-capture rejects missing lead data', async () => {
      const { createSmsEmailPipelineRouter } = await import('../../routes/sms-email-pipeline.js');
      const app = createContractApp({ mounts: [{ path: '/', router: () => createSmsEmailPipelineRouter({ smsEmailPipeline: {} }) }] });
      await request(app).post('/api/initiate-lead-capture').send({ leadData: {} }).expect(400);
    });
  });

  describe('routes/leads-followups.js', () => {
    test('happy: GET /api/leads/:id returns lead when present', async () => {
      const deps = {
        getClientFromHeader: async () => ({ clientKey: 'c1' }),
        readJson: async () => [{ id: '1', tenantId: 'c1', phone: '+44' }],
        writeJson: async () => {},
        LEADS_PATH: 'x',
        getFullClient: async () => ({ clientKey: 'c1' }),
        isBusinessHours: () => true,
        TIMEZONE: 'Europe/London',
        VAPI_ASSISTANT_ID: 'a',
        VAPI_PHONE_NUMBER_ID: 'p',
        VAPI_PRIVATE_KEY: 'k',
        smsConfig: () => ({ smsClient: { messages: { create: async () => ({ sid: 'x' }) } }, configured: true })
      };
      const { createLeadsFollowupsRouter } = await import('../../routes/leads-followups.js');
      const app = createContractApp({ mounts: [{ path: '/api/leads', router: () => createLeadsFollowupsRouter(deps) }] });
      const res = await request(app).get('/api/leads/1').expect(200);
      expect(res.body).toEqual(expect.objectContaining({ ok: true, lead: expect.any(Object) }));
    });

    test('failure: POST /api/leads/nudge returns 401 when X-Client-Key unknown', async () => {
      const deps = {
        getClientFromHeader: async () => null,
        readJson: async () => [],
        writeJson: async () => {},
        LEADS_PATH: 'x',
        getFullClient: async () => null,
        isBusinessHours: () => true,
        TIMEZONE: 'Europe/London',
        smsConfig: () => ({ configured: false })
      };
      const { createLeadsFollowupsRouter } = await import('../../routes/leads-followups.js');
      const app = createContractApp({ mounts: [{ path: '/api/leads', router: () => createLeadsFollowupsRouter(deps) }] });
      await request(app).post('/api/leads/nudge').send({ id: '1' }).expect(401);
    });
  });

  describe('routes/calendar-api.js', () => {
    jest.setTimeout(120000);

    test('happy: POST /api/calendar/cancel returns ok true', async () => {
      const deps = {
        getClientFromHeader: async () => ({ clientKey: 'c1', booking: { defaultDurationMin: 30 } }),
        makeJwtAuth: () => ({ authorize: async () => {} }),
        GOOGLE_CLIENT_EMAIL: 'x',
        GOOGLE_PRIVATE_KEY: 'k',
        google: { calendar: () => ({ events: { delete: async () => {} } }) },
        pickCalendarId: () => 'cal',
        insertEvent: async () => ({ id: 'e1', htmlLink: '', status: 'confirmed' }),
        pickTimezone: () => 'Europe/London',
        smsConfig: () => ({ configured: false, smsClient: { messages: { create: async () => ({}) } } })
      };
      const { createCalendarApiRouter } = await import('../../routes/calendar-api.js');
      const app = createContractApp({ mounts: [{ path: '/api/calendar', router: () => createCalendarApiRouter(deps) }] });
      const res = await request(app).post('/api/calendar/cancel').send({ eventId: 'e1' }).expect(200);
      expect(res.body).toEqual(expect.objectContaining({ ok: true }));
    });

    test('failure: POST /api/calendar/cancel rejects unknown tenant', async () => {
      const deps = {
        getClientFromHeader: async () => null,
        makeJwtAuth: () => ({ authorize: async () => {} }),
        GOOGLE_CLIENT_EMAIL: 'x',
        GOOGLE_PRIVATE_KEY: 'k',
        google: { calendar: () => ({ events: { delete: async () => {} } }) },
        pickCalendarId: () => 'cal',
        insertEvent: async () => ({ id: 'e1', htmlLink: '', status: 'confirmed' }),
        pickTimezone: () => 'Europe/London',
        smsConfig: () => ({ configured: false, smsClient: { messages: { create: async () => ({}) } } })
      };
      const { createCalendarApiRouter } = await import('../../routes/calendar-api.js');
      const app = createContractApp({ mounts: [{ path: '/api/calendar', router: () => createCalendarApiRouter(deps) }] });
      await request(app).post('/api/calendar/cancel').send({ eventId: 'e1' }).expect(400);
    });
  });

  describe('routes/clients-api.js', () => {
    beforeEach(() => {
      jest.resetModules();
      jest.unstable_mockModule('../../middleware/security.js', () => ({
        authenticateApiKey: (req, res, next) => {
          const k = req.get('X-API-Key');
          if (!k) return res.status(401).json({ ok: false, error: 'unauthorized' });
          if (k === 'k1') {
            req.clientKey = 'c1';
            req.apiKey = { permissions: [] };
            return next();
          }
          if (k === 'k2') {
            req.clientKey = 'c2';
            req.apiKey = { permissions: [] };
            return next();
          }
          if (k === 'admin') {
            req.clientKey = 'admin';
            req.apiKey = { permissions: ['*'] };
            return next();
          }
          return res.status(401).json({ ok: false, error: 'unauthorized' });
        },
        requireTenantAccess: (req, res, next) => {
          const requested = req.params?.tenantKey || req.params?.clientKey || req.params?.key || req.query?.clientKey || req.body?.clientKey;
          if (!requested) return res.status(400).json({ ok: false, error: 'tenant_key_required' });
          if (requested !== req.clientKey && !(Array.isArray(req.apiKey?.permissions) && req.apiKey.permissions.includes('*'))) {
            return res.status(403).json({ ok: false, error: 'forbidden' });
          }
          next();
        }
      }));
    });

    test('failure: GET /api/clients returns 401 without api key', async () => {
      const { createClientsApiRouter } = await import('../../routes/clients-api.js');
      const app = createContractApp({
        mounts: [
          {
            path: '/api/clients',
            router: () =>
              createClientsApiRouter({
                listFullClients: async () => [{ clientKey: 'c1' }],
                getFullClient: async () => ({ clientKey: 'c1' }),
                upsertFullClient: async () => ({}),
                deleteClient: async () => ({ changes: 1 }),
                pickTimezone: () => 'Europe/London',
                isDashboardSelfServiceClient: () => false
              })
          }
        ]
      });
      await request(app).get('/api/clients').expect(401);
    });

    test('happy: GET /api/clients returns ok true (self-only for non-admin)', async () => {
      const { createClientsApiRouter } = await import('../../routes/clients-api.js');
      const app = createContractApp({
        mounts: [
          {
            path: '/api/clients',
            router: () =>
              createClientsApiRouter({
                listFullClients: async () => [{ clientKey: 'c1' }],
                getFullClient: async (k) => (k === 'c1' ? { clientKey: 'c1' } : null),
                upsertFullClient: async () => ({}),
                deleteClient: async () => ({ changes: 1 }),
                pickTimezone: () => 'Europe/London',
                isDashboardSelfServiceClient: () => false
              })
          }
        ]
      });
      const res = await request(app).get('/api/clients').set('X-API-Key', 'k1').expect(200);
      expect(res.body).toEqual(expect.objectContaining({ ok: true, count: 1 }));
    });

    test('failure: GET /api/clients/:key returns 403 on tenant mismatch', async () => {
      const { createClientsApiRouter } = await import('../../routes/clients-api.js');
      const app = createContractApp({
        mounts: [
          {
            path: '/api/clients',
            router: () =>
              createClientsApiRouter({
                listFullClients: async () => [],
                getFullClient: async () => ({ clientKey: 'c2' }),
                upsertFullClient: async () => ({}),
                deleteClient: async () => ({ changes: 0 }),
                pickTimezone: () => 'Europe/London',
                isDashboardSelfServiceClient: () => false
              })
          }
        ]
      });
      await request(app).get('/api/clients/c2').set('X-API-Key', 'k1').expect(403);
    });

    test('failure: GET /api/clients/:key returns 404 when missing (authorized tenant)', async () => {
      const { createClientsApiRouter } = await import('../../routes/clients-api.js');
      const app = createContractApp({
        mounts: [
          {
            path: '/api/clients',
            router: () =>
              createClientsApiRouter({
                listFullClients: async () => [],
                getFullClient: async () => null,
                upsertFullClient: async () => ({}),
                deleteClient: async () => ({ changes: 0 }),
                pickTimezone: () => 'Europe/London',
                isDashboardSelfServiceClient: () => false
              })
          }
        ]
      });
      await request(app).get('/api/clients/c1').set('X-API-Key', 'k1').expect(404);
    });
  });

  describe('routes/calendar-api.js', () => {
    test('failure: POST /api/calendar/find-slots rejects missing tenant header', async () => {
      const { createCalendarApiRouter } = await import('../../routes/calendar-api.js');
      const app = createContractApp({
        mounts: [
          {
            path: '/api/calendar',
            router: () =>
              createCalendarApiRouter({
                getClientFromHeader: async () => null,
                pickTimezone: () => 'Europe/London',
                pickCalendarId: () => 'cal',
                getGoogleCredentials: () => ({ clientEmail: 'x', privateKey: 'y', privateKeyB64: '' }),
                makeJwtAuth: () => ({ authorize: async () => {} }),
                freeBusy: async () => [],
                google: { calendar: () => ({ events: { delete: async () => {} } }) },
                insertEvent: async () => ({ id: 'e1', htmlLink: 'x', status: 'confirmed' }),
                smsConfig: () => ({ configured: false, smsClient: { messages: { create: async () => {} } } }),
              }),
          },
        ],
      });
      await request(app).post('/api/calendar/find-slots').send({}).expect(400);
    });
  });
});

