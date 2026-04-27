import { describe, test, expect, jest, beforeAll, afterAll, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createLeadsPortalRouter } from '../../routes/leads-portal-mount.js';

import { createContractApp } from '../helpers/contract-harness.js';
import { assertJsonErrorEnvelope, assertNoTenantKeyLeak } from '../helpers/contract-asserts.js';

let consoleErrSpy;
beforeAll(() => { consoleErrSpy = jest.spyOn(console, 'error').mockImplementation(() => {}); });
afterAll(() => { consoleErrSpy.mockRestore(); });

describe('routes/leads-portal-mount', () => {
  test('failure: POST /api/leads returns 401 when tenant missing', async () => {
    const app = express();
    app.use(express.json());
    app.use(
      createLeadsPortalRouter({
        getClientFromHeader: async () => null,
        normalizePhoneE164: () => null,
        readJson: async () => [],
        writeJson: async () => {},
        LEADS_PATH: 'x',
        nanoid: () => 'id',
        smsConfig: () => ({ configured: false }),
        renderTemplate: () => '',
      }),
    );
    const res = await request(app).post('/api/leads').send({ lead: { name: 'A', phone: '+44' } });
    expect(res.status).toBe(401);
  });

  test('failure: POST /api/leads returns 400 when lead name/phone missing', async () => {
    const app = express();
    app.use(express.json());
    app.use(
      createLeadsPortalRouter({
        getClientFromHeader: async () => ({ clientKey: 'c1' }),
        normalizePhoneE164: () => '+15551234567',
        readJson: async () => [],
        writeJson: async () => {},
        LEADS_PATH: 'x',
        nanoid: () => 'id',
        smsConfig: () => ({ configured: false }),
        renderTemplate: () => '',
      }),
    );
    const res = await request(app).post('/api/leads').send({ lead: { name: '', phone: '' } });
    expect(res.status).toBe(400);
  });

  test('happy: POST /api/leads returns 201 and persists lead', async () => {
    const writeJson = jest.fn(async () => {});
    const readJson = jest.fn(async () => []);
    const app = express();
    app.use(express.json());
    app.use(
      createLeadsPortalRouter({
        getClientFromHeader: async () => ({ clientKey: 'c1', displayName: 'Clinic', booking: { country: 'GB' } }),
        normalizePhoneE164: () => '+447400000000',
        readJson,
        writeJson,
        LEADS_PATH: 'x',
        nanoid: () => 'id',
        smsConfig: () => ({ configured: false }),
        renderTemplate: () => '',
      }),
    );
    const res = await request(app)
      .post('/api/leads')
      .set('X-Client-Key', 'c1')
      .send({ service: 'checkup', lead: { name: 'A', phone: '+44 7400 000 000' } });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(writeJson).toHaveBeenCalledTimes(1);
  });

  test('failure: GET /api/leads requires clientKey', async () => {
    const app = express();
    app.use(express.json());
    app.use(
      createLeadsPortalRouter({
        getClientFromHeader: async () => null,
        normalizePhoneE164: () => null,
        readJson: async () => [],
        writeJson: async () => {},
        LEADS_PATH: 'x',
        nanoid: () => 'id',
        smsConfig: () => ({ configured: false }),
        renderTemplate: () => '',
      }),
    );
    await request(app).get('/api/leads').expect(400);
  });

  test('POST /api/leads 400 when phone fails E.164 normalization', async () => {
    const app = express();
    app.use(express.json());
    app.use(
      createLeadsPortalRouter({
        getClientFromHeader: async () => ({ clientKey: 'c1' }),
        normalizePhoneE164: () => null,
        readJson: async () => [],
        writeJson: async () => {},
        LEADS_PATH: 'x',
        nanoid: () => 'id',
        smsConfig: () => ({ configured: false }),
        renderTemplate: () => ''
      })
    );
    const res = await request(app)
      .post('/api/leads')
      .send({ lead: { name: 'A', phone: 'not-a-phone' } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid phone/);
  });

  test('POST /api/leads triggers auto-nudge when configured + autoNudge=true', async () => {
    const messages = { create: jest.fn(async () => ({ sid: 'SM1' })) };
    const renderTemplate = jest.fn((t, vars) => `Hi ${vars.name}, it's ${vars.brand}`);
    const app = express();
    app.use(express.json());
    app.use(createLeadsPortalRouter({
      getClientFromHeader: async () => ({ clientKey: 'c1', displayName: 'Clinic' }),
      normalizePhoneE164: () => '+447400000000',
      readJson: async () => [],
      writeJson: async () => {},
      LEADS_PATH: 'x',
      nanoid: () => 'id',
      smsConfig: () => ({ configured: true, smsClient: { messages }, fromNumber: '+447777777777' }),
      renderTemplate
    }));
    const res = await request(app)
      .post('/api/leads')
      .send({ lead: { name: 'A', phone: '+447400' }, autoNudge: true });
    expect(res.status).toBe(201);
    expect(messages.create).toHaveBeenCalledWith(expect.objectContaining({
      to: '+447400000000',
      body: expect.stringContaining('Clinic'),
      from: '+447777777777'
    }));
    expect(renderTemplate).toHaveBeenCalled();
  });

  test('POST /api/leads suppresses nudge when skipNudge=true', async () => {
    const messages = { create: jest.fn(async () => ({ sid: 'SM1' })) };
    const app = express();
    app.use(express.json());
    app.use(createLeadsPortalRouter({
      getClientFromHeader: async () => ({ clientKey: 'c1' }),
      normalizePhoneE164: () => '+447400000000',
      readJson: async () => [],
      writeJson: async () => {},
      LEADS_PATH: 'x',
      nanoid: () => 'id',
      smsConfig: () => ({ configured: true, smsClient: { messages }, fromNumber: '+1' }),
      renderTemplate: () => ''
    }));
    const res = await request(app)
      .post('/api/leads')
      .send({ lead: { name: 'A', phone: '+44' }, autoNudge: true, skipNudge: true });
    expect(res.status).toBe(201);
    expect(messages.create).not.toHaveBeenCalled();
  });

  test('POST /api/leads 500 when readJson throws', async () => {
    const app = express();
    app.use(express.json());
    app.use(createLeadsPortalRouter({
      getClientFromHeader: async () => ({ clientKey: 'c1' }),
      normalizePhoneE164: () => '+447400000000',
      readJson: async () => { throw new Error('disk'); },
      writeJson: async () => {},
      LEADS_PATH: 'x',
      nanoid: () => 'id',
      smsConfig: () => ({ configured: false }),
      renderTemplate: () => ''
    }));
    const res = await request(app).post('/api/leads').send({ lead: { name: 'A', phone: '+44' } });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal error');
    expect(res.body).not.toHaveProperty('details'); // no stack/internal leak
  });
});

describe('routes/leads-portal-mount GET /api/leads (db-backed)', () => {
  beforeEach(() => { jest.resetModules(); });

  test('200 maps DB rows + supports limit param', async () => {
    let seenParams;
    const query = jest.fn(async (sql, params) => {
      seenParams = params;
      return {
        rows: [
          { id: 1, name: null, phone: '+44', email: 'a@x', status: null, tags: 'a, b', source: null, score: null, notes: null, custom_fields: null, created_at: 'd', updated_at: 'd', last_contacted_at: null }
        ]
      };
    });
    jest.unstable_mockModule('../../db.js', () => ({ query }));
    const { createLeadsPortalRouter: factory } = await import('../../routes/leads-portal-mount.js');
    const app = createContractApp({
      mounts: [{ path: '/', router: () => factory({
        getClientFromHeader: async () => null,
        normalizePhoneE164: () => null,
        readJson: async () => [],
        writeJson: async () => {},
        LEADS_PATH: 'x',
        nanoid: () => 'id',
        smsConfig: () => ({ configured: false }),
        renderTemplate: () => ''
      }) }]
    });
    const res = await request(app).get('/api/leads').query({ clientKey: 'acme', limit: 25 }).expect(200);
    expect(res.body).toEqual({
      success: true,
      count: 1,
      leads: [
        expect.objectContaining({
          id: 1,
          name: 'Unknown',
          status: 'new',
          score: 50,
          source: 'Unknown',
          notes: '',
          tags: ['a', 'b'],
          customFields: {}
        })
      ]
    });
    expect(seenParams).toEqual(['acme', 25]);
  });

  test('500 when query rejects', async () => {
    jest.unstable_mockModule('../../db.js', () => ({ query: jest.fn(async () => { throw new Error('boom'); }) }));
    const { createLeadsPortalRouter: factory } = await import('../../routes/leads-portal-mount.js');
    const app = createContractApp({
      mounts: [{ path: '/', router: () => factory({
        getClientFromHeader: async () => null,
        normalizePhoneE164: () => null,
        readJson: async () => [],
        writeJson: async () => {},
        LEADS_PATH: 'x',
        nanoid: () => 'id',
        smsConfig: () => ({ configured: false }),
        renderTemplate: () => ''
      }) }]
    });
    const res = await request(app).get('/api/leads').query({ clientKey: 'acme' }).expect(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Failed to fetch leads');
    assertJsonErrorEnvelope(res, { status: 500 });
  });

  test('GET /api/leads (db-backed): Tom internal tenant key never leaks', async () => {
    const query = jest.fn(async () => ({
      rows: [{ id: 1, client_key: 'd2d-xpress-tom', name: 'Acme Ltd' }]
    }));
    jest.unstable_mockModule('../../db.js', () => ({ query }));
    const { createLeadsPortalRouter: factory } = await import('../../routes/leads-portal-mount.js');
    const app = createContractApp({
      mounts: [{ path: '/', router: () => factory({
        getClientFromHeader: async () => null,
        normalizePhoneE164: () => null,
        readJson: async () => [],
        writeJson: async () => {},
        LEADS_PATH: 'x',
        nanoid: () => 'id',
        smsConfig: () => ({ configured: false }),
        renderTemplate: () => ''
      }) }]
    });
    const res = await request(app).get('/api/leads').query({ clientKey: 'd2d-xpress-tom' }).expect(200);
    assertNoTenantKeyLeak(res, 'd2d-xpress-tom');
  });
});

describe('routes/leads-portal-mount PUT /api/leads/:leadId (db-backed)', () => {
  beforeEach(() => { jest.resetModules(); });

  function makeApp(query) {
    return (async () => {
      jest.unstable_mockModule('../../db.js', () => ({ query }));
      const { createLeadsPortalRouter: factory } = await import('../../routes/leads-portal-mount.js');
      return createContractApp({
        mounts: [{ path: '/', router: () => factory({
          getClientFromHeader: async () => null,
          normalizePhoneE164: () => null,
          readJson: async () => [],
          writeJson: async () => {},
          LEADS_PATH: 'x',
          nanoid: () => 'id',
          smsConfig: () => ({ configured: false }),
          renderTemplate: () => ''
        }) }]
      });
    })();
  }

  test('400 when clientKey missing', async () => {
    const app = await makeApp(jest.fn());
    await request(app).put('/api/leads/L1').send({}).expect(400);
  });

  test('404 when lead missing', async () => {
    const app = await makeApp(jest.fn(async () => ({ rows: [] })));
    const res = await request(app).put('/api/leads/L1').query({ clientKey: 'acme' }).send({ status: 'x' }).expect(404);
    expect(res.body.error).toBe('Lead not found');
  });

  test('403 cross-tenant access', async () => {
    const query = jest.fn(async () => ({ rows: [{ id: 'L1', client_key: 'other' }] }));
    const app = await makeApp(query);
    const res = await request(app).put('/api/leads/L1').query({ clientKey: 'acme' }).send({ status: 'x' }).expect(403);
    expect(res.body.error).toBe('Access denied');
  });

  test('400 when no fields to update', async () => {
    const query = jest.fn(async () => ({ rows: [{ id: 'L1', client_key: 'acme' }] }));
    const app = await makeApp(query);
    const res = await request(app).put('/api/leads/L1').query({ clientKey: 'acme' }).send({}).expect(400);
    expect(res.body.error).toBe('No fields to update');
  });

  test('200 updates allowed fields and joins tags array into csv', async () => {
    let updateParams;
    const query = jest.fn(async (sql, params) => {
      const s = String(sql);
      if (s.includes('SELECT id, client_key FROM leads')) {
        return { rows: [{ id: 'L1', client_key: 'acme' }] };
      }
      updateParams = params;
      return { rows: [{ id: 'L1', name: 'X', tags: 'a,b' }] };
    });
    const app = await makeApp(query);
    const res = await request(app)
      .put('/api/leads/L1')
      .query({ clientKey: 'acme' })
      .send({ name: 'X', tags: ['a', 'b'], score: 80 })
      .expect(200);
    expect(res.body.success).toBe(true);
    // params: [name, tagsCsv, score, leadId]
    expect(updateParams).toEqual(['X', 'a,b', 80, 'L1']);
  });

  test('500 when update query rejects', async () => {
    const query = jest.fn(async (sql) => {
      const s = String(sql);
      if (s.includes('SELECT id, client_key FROM leads')) return { rows: [{ id: 'L1', client_key: 'acme' }] };
      throw new Error('upd');
    });
    const app = await makeApp(query);
    const res = await request(app).put('/api/leads/L1').query({ clientKey: 'acme' }).send({ status: 'x' }).expect(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Failed to update lead');
  });
});

