import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import request from 'supertest';

import { createContractApp } from '../helpers/contract-harness.js';

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
    await request(app).get('/integration-health/c1').expect(500);
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
});

