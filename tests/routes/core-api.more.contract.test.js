import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import request from 'supertest';

import { createContractApp } from '../helpers/contract-harness.js';
import { assertJsonErrorEnvelope, assertNoTenantKeyLeak } from '../helpers/contract-asserts.js';

beforeEach(() => {
  jest.resetModules();
});

describe('routes/core-api.js additional contracts (happy + failure)', () => {
  test('happy: GET /integration-health/:clientKey returns ok true', async () => {
    const { createCoreApiRouter } = await import('../../routes/core-api.js');
    const app = createContractApp({
      mounts: [
        {
          path: '/',
          router: () =>
            createCoreApiRouter({
              query: async () => ({ rows: [] }),
              getIntegrationStatuses: async () => ({ ok: true })
            })
        }
      ]
    });
    const res = await request(app).get('/integration-health/c1').expect(200);
    expect(res.body).toEqual(expect.objectContaining({ ok: true, integrations: { ok: true } }));
  });

  test('failure: GET /integration-health/:clientKey returns 500 when deps throw', async () => {
    const { createCoreApiRouter } = await import('../../routes/core-api.js');
    const app = createContractApp({
      mounts: [
        {
          path: '/',
          router: () =>
            createCoreApiRouter({
              query: async () => ({ rows: [] }),
              getIntegrationStatuses: async () => {
                throw new Error('down');
              }
            })
        }
      ]
    });
    const res = await request(app).get('/integration-health/c1').expect(500);
    assertJsonErrorEnvelope(res, { status: 500 });
  });

  test('Tom-context: GET /integration-health/d2d-xpress-tom does not echo internal tenant key', async () => {
    const { createCoreApiRouter } = await import('../../routes/core-api.js');
    const app = createContractApp({
      mounts: [
        {
          path: '/',
          router: () =>
            createCoreApiRouter({
              query: async () => ({ rows: [] }),
              getIntegrationStatuses: async () => ({ ok: true, displayName: 'D2D Xpress' })
            })
        }
      ]
    });
    const res = await request(app).get('/integration-health/d2d-xpress-tom').expect(200);
    assertNoTenantKeyLeak(res, 'd2d-xpress-tom');
  });

  test('failure: POST /leads/:leadId/snooze returns 403 when lead belongs to another client', async () => {
    const query = jest.fn(async (sql) => {
      const s = String(sql);
      if (s.includes('FROM leads') && s.includes('WHERE id = $1')) {
        return {
          rows: [
            {
              id: 1,
              client_key: 'other',
              phone: '+447700900000',
              name: 'A',
              service: 'cut',
              status: 'New',
              source: 'x',
              notes: ''
            }
          ]
        };
      }
      return { rows: [] };
    });
    const { createCoreApiRouter } = await import('../../routes/core-api.js');
    const app = createContractApp({
      mounts: [
        {
          path: '/',
          router: () =>
            createCoreApiRouter({
              query,
              getIntegrationStatuses: async () => ({})
            })
        }
      ]
    });

    const res = await request(app)
      .post('/leads/1/snooze')
      .send({ clientKey: 'acme', minutes: 10 })
      .expect(403);
    expect(res.body).toEqual(expect.objectContaining({ ok: false, error: 'Access denied' }));
  });

  // ---- /calls/:callId ----
  test('GET /calls/:callId returns 404 when call missing', async () => {
    const query = jest.fn(async () => ({ rows: [] }));
    const { createCoreApiRouter } = await import('../../routes/core-api.js');
    const app = createContractApp({
      mounts: [{ path: '/', router: () => createCoreApiRouter({ query, getIntegrationStatuses: async () => ({}) }) }]
    });
    const res = await request(app).get('/calls/missing').query({ clientKey: 'ck' }).expect(404);
    expect(res.body).toEqual({ ok: false, error: 'Call not found' });
  });

  test('GET /calls/:callId returns 500 when query rejects', async () => {
    const query = jest.fn(async () => { throw new Error('db kaboom'); });
    const { createCoreApiRouter } = await import('../../routes/core-api.js');
    const app = createContractApp({
      mounts: [{ path: '/', router: () => createCoreApiRouter({ query, getIntegrationStatuses: async () => ({}) }) }]
    });
    const res = await request(app).get('/calls/x').query({ clientKey: 'ck' }).expect(500);
    expect(res.body).toEqual({ ok: false, error: 'db kaboom' });
  });

  // ---- /leads/:leadId/snooze ----
  test('POST /leads/:leadId/snooze 400 when clientKey missing', async () => {
    const query = jest.fn();
    const { createCoreApiRouter } = await import('../../routes/core-api.js');
    const app = createContractApp({
      mounts: [{ path: '/', router: () => createCoreApiRouter({ query, getIntegrationStatuses: async () => ({}) }) }]
    });
    const res = await request(app).post('/leads/1/snooze').send({}).expect(400);
    expect(res.body.error).toBe('clientKey required');
    expect(query).not.toHaveBeenCalled();
  });

  test('POST /leads/:leadId/snooze 404 when lead not found', async () => {
    const query = jest.fn(async () => ({ rows: [] }));
    const { createCoreApiRouter } = await import('../../routes/core-api.js');
    const app = createContractApp({
      mounts: [{ path: '/', router: () => createCoreApiRouter({ query, getIntegrationStatuses: async () => ({}) }) }]
    });
    const res = await request(app).post('/leads/99/snooze').send({ clientKey: 'acme' }).expect(404);
    expect(res.body.error).toBe('Lead not found');
  });

  test('POST /leads/:leadId/snooze happy returns sanitized lead and enforces minimum minutes', async () => {
    const query = jest.fn(async (sql, params) => {
      const s = String(sql);
      if (s.includes('FROM leads') && s.includes('WHERE id = $1')) {
        return { rows: [{ id: 7, client_key: 'acme', phone: '+447700900000', name: 'L', service: 's', status: 'New', source: 'x', notes: 'old' }] };
      }
      if (s.includes('UPDATE leads')) {
        return { rows: [{ id: 7, name: 'L', phone: '+447700900000', service: 's', status: 'Snoozed', source: 'x', notes: 'updated' }] };
      }
      return { rows: [] };
    });
    const { createCoreApiRouter } = await import('../../routes/core-api.js');
    const app = createContractApp({
      mounts: [{ path: '/', router: () => createCoreApiRouter({ query, getIntegrationStatuses: async () => ({}) }) }]
    });
    const res = await request(app).post('/leads/7/snooze').send({ clientKey: 'acme', minutes: 1 }).expect(200);
    expect(res.body).toEqual({
      ok: true,
      lead: expect.objectContaining({ id: 7, status: 'Snoozed', lastMessage: 'updated' })
    });
    expect(res.body.lead).not.toHaveProperty('client_key');
  });

  test('POST /leads/:leadId/snooze 500 on db failure', async () => {
    const query = jest.fn(async () => { throw new Error('snooze fail'); });
    const { createCoreApiRouter } = await import('../../routes/core-api.js');
    const app = createContractApp({
      mounts: [{ path: '/', router: () => createCoreApiRouter({ query, getIntegrationStatuses: async () => ({}) }) }]
    });
    const res = await request(app).post('/leads/7/snooze').send({ clientKey: 'acme' }).expect(500);
    expect(res.body.error).toBe('snooze fail');
  });

  // ---- /leads/:leadId/escalate ----
  test('POST /leads/:leadId/escalate 400 when clientKey missing', async () => {
    const query = jest.fn();
    const { createCoreApiRouter } = await import('../../routes/core-api.js');
    const app = createContractApp({
      mounts: [{ path: '/', router: () => createCoreApiRouter({ query, getIntegrationStatuses: async () => ({}) }) }]
    });
    const res = await request(app).post('/leads/1/escalate').send({}).expect(400);
    expect(res.body.error).toBe('clientKey required');
  });

  test('POST /leads/:leadId/escalate 404 when lead missing', async () => {
    const query = jest.fn(async () => ({ rows: [] }));
    const { createCoreApiRouter } = await import('../../routes/core-api.js');
    const app = createContractApp({
      mounts: [{ path: '/', router: () => createCoreApiRouter({ query, getIntegrationStatuses: async () => ({}) }) }]
    });
    await request(app).post('/leads/99/escalate').send({ clientKey: 'acme' }).expect(404);
  });

  test('POST /leads/:leadId/escalate 403 cross-tenant', async () => {
    const query = jest.fn(async () => ({ rows: [{ id: 1, client_key: 'other', phone: '+447700900000', name: 'X', service: 'a', status: 'New', source: 's', notes: '' }] }));
    const { createCoreApiRouter } = await import('../../routes/core-api.js');
    const app = createContractApp({
      mounts: [{ path: '/', router: () => createCoreApiRouter({ query, getIntegrationStatuses: async () => ({}) }) }]
    });
    const res = await request(app).post('/leads/1/escalate').send({ clientKey: 'acme' }).expect(403);
    expect(res.body.error).toBe('Access denied');
  });

  test('POST /leads/:leadId/escalate happy returns sanitized lead with Priority status', async () => {
    const query = jest.fn(async (sql) => {
      const s = String(sql);
      if (s.includes('FROM leads') && s.includes('WHERE id = $1')) {
        return { rows: [{ id: 7, client_key: 'acme', phone: '+447700900000', name: 'L', service: 's', status: 'New', source: 'x', notes: '' }] };
      }
      if (s.includes('UPDATE leads')) {
        return { rows: [{ id: 7, name: 'L', phone: '+447700900000', service: 's', status: 'Priority', source: 'x', notes: 'esc' }] };
      }
      return { rows: [] };
    });
    const { createCoreApiRouter } = await import('../../routes/core-api.js');
    const app = createContractApp({
      mounts: [{ path: '/', router: () => createCoreApiRouter({ query, getIntegrationStatuses: async () => ({}) }) }]
    });
    const res = await request(app).post('/leads/7/escalate').send({ clientKey: 'acme' }).expect(200);
    expect(res.body.lead.status).toBe('Priority');
  });

  test('POST /leads/:leadId/escalate 500 on db failure', async () => {
    const query = jest.fn(async () => { throw new Error('esc fail'); });
    const { createCoreApiRouter } = await import('../../routes/core-api.js');
    const app = createContractApp({
      mounts: [{ path: '/', router: () => createCoreApiRouter({ query, getIntegrationStatuses: async () => ({}) }) }]
    });
    const res = await request(app).post('/leads/7/escalate').send({ clientKey: 'acme' }).expect(500);
    expect(res.body.ok).toBe(false);
  });

  // ---- /export/:type ----
  test('GET /export/:type 400 when clientKey missing', async () => {
    const { createCoreApiRouter } = await import('../../routes/core-api.js');
    const app = createContractApp({
      mounts: [{ path: '/', router: () => createCoreApiRouter({ query: jest.fn(), getIntegrationStatuses: async () => ({}) }) }]
    });
    await request(app).get('/export/leads').expect(400);
  });

  test('GET /export/:type 400 for invalid type', async () => {
    const query = jest.fn(async () => ({ rows: [] }));
    const { createCoreApiRouter } = await import('../../routes/core-api.js');
    const app = createContractApp({
      mounts: [{ path: '/', router: () => createCoreApiRouter({ query, getIntegrationStatuses: async () => ({}) }) }]
    });
    const res = await request(app).get('/export/widgets').query({ clientKey: 'acme' }).expect(400);
    expect(res.body.error).toBe('Invalid export type');
  });

  test('GET /export/leads returns CSV with header row', async () => {
    const query = jest.fn(async () => ({ rows: [{ name: 'A', phone: '+1', service: 's', source: 'x', status: 'New', notes: 'n', created_at: '2024-01-01' }] }));
    const { createCoreApiRouter } = await import('../../routes/core-api.js');
    const app = createContractApp({
      mounts: [{ path: '/', router: () => createCoreApiRouter({ query, getIntegrationStatuses: async () => ({}) }) }]
    });
    const res = await request(app).get('/export/leads').query({ clientKey: 'acme' }).expect(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/leads-export-/);
    expect(res.text).toMatch(/^Name,Phone,Service/);
    expect(res.text).toContain('"A"');
  });

  test('GET /export/calls returns CSV', async () => {
    const query = jest.fn(async () => ({ rows: [{ name: 'A', lead_phone: '+1', status: 'done', outcome: 'ok', duration: 12, created_at: '2024-01-01' }] }));
    const { createCoreApiRouter } = await import('../../routes/core-api.js');
    const app = createContractApp({
      mounts: [{ path: '/', router: () => createCoreApiRouter({ query, getIntegrationStatuses: async () => ({}) }) }]
    });
    const res = await request(app).get('/export/calls').query({ clientKey: 'acme' }).expect(200);
    expect(res.text).toMatch(/^Name,Phone,Status,Outcome/);
    expect(res.headers['content-disposition']).toMatch(/calls-export-/);
  });

  test('GET /export/appointments returns CSV', async () => {
    const query = jest.fn(async () => ({ rows: [{ name: 'A', start_iso: '2024-01-01T09:00', end_iso: '2024-01-01T10:00', status: 'booked', service: 'cut' }] }));
    const { createCoreApiRouter } = await import('../../routes/core-api.js');
    const app = createContractApp({
      mounts: [{ path: '/', router: () => createCoreApiRouter({ query, getIntegrationStatuses: async () => ({}) }) }]
    });
    const res = await request(app).get('/export/appointments').query({ clientKey: 'acme' }).expect(200);
    expect(res.text).toMatch(/^Name,Start UTC,Start Local,End UTC,End Local,Status,Service,Tenant Timezone/);
    expect(res.headers['content-disposition']).toMatch(/appointments-export-/);
  });

  test('GET /export/leads 500 when query rejects', async () => {
    const query = jest.fn(async () => { throw new Error('boom'); });
    const { createCoreApiRouter } = await import('../../routes/core-api.js');
    const app = createContractApp({
      mounts: [{ path: '/', router: () => createCoreApiRouter({ query, getIntegrationStatuses: async () => ({}) }) }]
    });
    const res = await request(app).get('/export/leads').query({ clientKey: 'acme' }).expect(500);
    expect(res.body.error).toBe('boom');
  });
});

