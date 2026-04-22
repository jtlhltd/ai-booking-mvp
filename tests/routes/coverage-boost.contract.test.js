import { describe, expect, test, jest, beforeEach, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';

import { createContractApp, withEnv } from '../helpers/contract-harness.js';

beforeEach(() => {
  jest.resetModules();
});

let coverageBoostConsoleErrorSpy;
beforeAll(() => {
  coverageBoostConsoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterAll(() => {
  coverageBoostConsoleErrorSpy.mockRestore();
});

describe('Coverage boost: previously-0% routes', () => {
  describe('routes/outreach.js', () => {
    test('happy: GET /api/outreach/prospects returns ok true', async () => {
      const query = jest.fn(async (sql) => {
        if (String(sql).includes('COUNT(*)')) return { rows: [{ total: '0' }] };
        return { rows: [] };
      });
      jest.unstable_mockModule('../../db.js', () => ({ query }));
      const { createOutreachRouter } = await import('../../routes/outreach.js');
      const app = createContractApp({ mounts: [{ path: '/api/outreach', router: () => createOutreachRouter() }] });
      const res = await request(app).get('/api/outreach/prospects').expect(200);
      expect(res.body).toEqual(expect.objectContaining({ ok: true, prospects: expect.any(Array) }));
    });

    test('failure: POST /api/outreach/prospects requires email', async () => {
      jest.unstable_mockModule('../../db.js', () => ({ query: jest.fn(async () => ({ rows: [] })) }));
      const { createOutreachRouter } = await import('../../routes/outreach.js');
      const app = createContractApp({ mounts: [{ path: '/api/outreach', router: () => createOutreachRouter() }] });
      await request(app).post('/api/outreach/prospects').send({}).expect(400);
    });
  });

  describe('routes/crm.js', () => {
    test('happy: GET /api/crm/integrations/:clientKey returns ok true', async () => {
      jest.unstable_mockModule('../../lib/crm-integrations.js', () => ({
        getCrmSettings: jest.fn(async () => ({ hubspot: { configured: true } })),
        getLastSyncStatus: jest.fn(async () => ({ hubspot: { lastSyncAt: null } }))
      }));
      const { createCrmRouter } = await import('../../routes/crm.js');
      const app = createContractApp({
        mounts: [{ path: '/api/crm', router: () => createCrmRouter({ getFullClient: async () => ({ clientKey: 'c1' }) }) }]
      });
      const res = await request(app).get('/api/crm/integrations/c1').expect(200);
      expect(res.body).toEqual(expect.objectContaining({ ok: true }));
    });

    test('failure: POST /api/crm/hubspot/sync rejects missing fields', async () => {
      const { createCrmRouter } = await import('../../routes/crm.js');
      const app = createContractApp({
        mounts: [{ path: '/api/crm', router: () => createCrmRouter({ getFullClient: async () => ({ clientKey: 'c1' }) }) }]
      });
      await request(app).post('/api/crm/hubspot/sync').send({}).expect(400);
    });
  });

  describe('routes/monitoring-dashboard.js', () => {
    test('happy: GET /monitoring/dashboard returns ok true', async () => {
      jest.unstable_mockModule('../../lib/monitoring-dashboard.js', () => ({
        getSystemMonitoringData: jest.fn(async () => ({ ok: true })),
        getClientUsageAnalytics: jest.fn(async () => []),
        getPerformanceTrends: jest.fn(async () => [])
      }));
      const { createMonitoringDashboardRouter } = await import('../../routes/monitoring-dashboard.js');
      const app = createContractApp({
        mounts: [{ path: '/', router: () => createMonitoringDashboardRouter({ authenticateApiKey: (_req, _res, next) => next() }) }]
      });
      const res = await request(app).get('/monitoring/dashboard').expect(200);
      expect(res.body).toEqual(expect.objectContaining({ ok: true, data: expect.any(Object) }));
    });

    test('failure: returns 500 when monitoring lib throws', async () => {
      jest.unstable_mockModule('../../lib/monitoring-dashboard.js', () => ({
        getSystemMonitoringData: jest.fn(async () => {
          throw new Error('boom');
        }),
        getClientUsageAnalytics: jest.fn(async () => []),
        getPerformanceTrends: jest.fn(async () => [])
      }));
      const { createMonitoringDashboardRouter } = await import('../../routes/monitoring-dashboard.js');
      const app = createContractApp({
        mounts: [{ path: '/', router: () => createMonitoringDashboardRouter({ authenticateApiKey: (_req, _res, next) => next() }) }]
      });
      await request(app).get('/monitoring/dashboard').expect(500);
    });
  });

  describe('routes/leads.js', () => {
    test('happy: POST /api/leads creates lead and returns 201', async () => {
      globalThis.fetch = jest.fn(async () => ({ ok: true, text: async () => 'ok' }));
      jest.unstable_mockModule('../../store.js', () => ({
        tenants: { findByKey: jest.fn(async () => ({ id: 1, key: 'c1', gsheet_id: 'sheet1', name: 'Client 1' })) },
        leads: {
          findByComposite: jest.fn(async () => null),
          create: jest.fn(async () => ({ id: 99, status: 'pending' })),
          updateSheetRowId: jest.fn(async () => {})
        }
      }));
      jest.unstable_mockModule('../../sheets.js', () => ({
        appendLead: jest.fn(async () => ({ rowNumber: 2 }))
      }));
      jest.unstable_mockModule('../../lib/operator-alerts.js', () => ({
        sendOperatorAlert: jest.fn(async () => ({ sent: false }))
      }));

      const { default: router } = await import('../../routes/leads.js');
      const app = createContractApp({ mounts: [{ path: '/', router }] });

      await withEnv({ API_KEY: 'k', VAPI_PRIVATE_KEY: 'vk' }, async () => {
        const res = await request(app)
          .post('/api/leads')
          .set('X-API-Key', 'k')
          .set('X-Client-Key', 'c1')
          .send({ service: 'x', lead: { name: 'A', phone: '07700900000' } })
          .expect(201);
        expect(res.body).toEqual(expect.objectContaining({ ok: true, leadId: 99 }));
      });
    });

    test('failure: POST /api/leads returns 401 when API key missing', async () => {
      jest.unstable_mockModule('../../store.js', () => ({ tenants: { findByKey: jest.fn(async () => null) }, leads: {} }));
      jest.unstable_mockModule('../../sheets.js', () => ({ appendLead: jest.fn(async () => ({ rowNumber: 2 })) }));
      jest.unstable_mockModule('../../lib/operator-alerts.js', () => ({ sendOperatorAlert: jest.fn(async () => ({ sent: false })) }));

      const { default: router } = await import('../../routes/leads.js');
      const app = createContractApp({ mounts: [{ path: '/', router }] });
      await request(app).post('/api/leads').send({}).expect(401);
    });
  });
});

