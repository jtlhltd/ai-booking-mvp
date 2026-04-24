import { describe, test, expect } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createAdminClientsHealthRouter } from '../../routes/admin-clients-health-mount.js';

describe('routes/admin-clients-health-mount', () => {
  test('401 without X-API-Key', async () => {
    const app = express();
    app.use(express.json());
    app.use(
      createAdminClientsHealthRouter({
        getApiKey: () => 'secret',
        loadDb: async () => ({
          listFullClients: async () => [],
          getLeadsByClient: async () => [],
          getCallsByTenant: async () => [],
        }),
        getFullClient: async () => null,
        listFullClients: async () => [],
        upsertFullClient: async () => ({}),
        normalizePhoneE164: (p) => p,
        calculateLeadScore: () => 0,
        query: async () => ({ rows: [] }),
        isPostgres: false,
        TWILIO_ACCOUNT_SID: null,
        TWILIO_AUTH_TOKEN: null,
      }),
    );

    const res = await request(app).get('/admin/clients');
    expect(res.status).toBe(401);
  });

  test('happy: GET /admin/clients returns ok true', async () => {
    const app = express();
    app.use(express.json());
    app.use(
      createAdminClientsHealthRouter({
        getApiKey: () => 'secret',
        loadDb: async () => ({
          listFullClients: async () => [{ key: 'c1' }],
          getLeadsByClient: async () => [{ id: 1 }],
          getCallsByTenant: async () => [],
        }),
        getFullClient: async () => null,
        listFullClients: async () => [{ clientKey: 'c1', sms: { fromNumber: '+1' } }],
        upsertFullClient: async () => ({}),
        normalizePhoneE164: (p) => p,
        calculateLeadScore: () => 0,
        query: async () => ({ rows: [] }),
        isPostgres: false,
        TWILIO_ACCOUNT_SID: null,
        TWILIO_AUTH_TOKEN: null,
      }),
    );

    const res = await request(app).get('/admin/clients').set('X-API-Key', 'secret');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({ ok: true }));
  });
});

