import { describe, test, expect, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createLeadsPortalRouter } from '../../routes/leads-portal-mount.js';

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
});

