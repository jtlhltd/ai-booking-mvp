import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import request from 'supertest';

import { createContractApp } from '../helpers/contract-harness.js';

beforeEach(() => {
  jest.resetModules();
});

function makeRouter() {
  const listFullClients = jest.fn(async () => []);
  const getFullClient = jest.fn(async () => null);
  const upsertFullClient = jest.fn(async () => ({}));
  const deleteClient = jest.fn(async () => ({ changes: 0 }));
  const pickTimezone = jest.fn(() => 'Europe/London');
  const isDashboardSelfServiceClient = jest.fn(() => false);

  return import('../../routes/clients-api.js').then(({ createClientsApiRouter }) =>
    createClientsApiRouter({
      listFullClients,
      getFullClient,
      upsertFullClient,
      deleteClient,
      pickTimezone,
      isDashboardSelfServiceClient
    })
  );
}

describe('routes/clients-api.js validation contracts', () => {
  test('POST /api/clients rejects missing clientKey', async () => {
    const router = await makeRouter();
    const app = createContractApp({ mounts: [{ path: '/api/clients', router }] });
    const res = await request(app).post('/api/clients').send({}).expect(400);
    expect(res.body).toEqual({ ok: false, error: 'clientKey is required' });
  });

  test('POST /api/clients rejects missing booking.timezone', async () => {
    const listFullClients = jest.fn(async () => []);
    const getFullClient = jest.fn(async () => null);
    const upsertFullClient = jest.fn(async () => ({}));
    const deleteClient = jest.fn(async () => ({ changes: 0 }));
    const pickTimezone = jest.fn(() => '');
    const isDashboardSelfServiceClient = jest.fn(() => false);

    const { createClientsApiRouter } = await import('../../routes/clients-api.js');
    const router = createClientsApiRouter({
      listFullClients,
      getFullClient,
      upsertFullClient,
      deleteClient,
      pickTimezone,
      isDashboardSelfServiceClient
    });
    const app = createContractApp({ mounts: [{ path: '/api/clients', router }] });
    const res = await request(app)
      .post('/api/clients')
      .send({ clientKey: 'c1', booking: {} })
      .expect(400);
    expect(res.body).toEqual({ ok: false, error: 'booking.timezone is required' });
  });

  test('POST /api/clients rejects sms block without fromNumber/messagingServiceSid', async () => {
    const router = await makeRouter();
    const app = createContractApp({ mounts: [{ path: '/api/clients', router }] });
    const res = await request(app)
      .post('/api/clients')
      .send({ clientKey: 'c1', booking: { timezone: 'Europe/London' }, sms: {} })
      .expect(400);
    expect(res.body).toEqual(
      expect.objectContaining({
        ok: false,
        error: 'sms.messagingServiceSid or sms.fromNumber required when sms block present'
      })
    );
  });
});

