import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import request from 'supertest';

import { createContractApp } from '../helpers/contract-harness.js';

beforeEach(() => {
  jest.resetModules();
});

describe('routes/admin-clients low coverage sweep', () => {
  test('GET /api/admin/client/:clientKey returns 404 when client missing', async () => {
    jest.unstable_mockModule('../../db.js', () => ({
      query: jest.fn(async () => ({ rows: [] })),
      listClientSummaries: jest.fn(async () => []),
      getFullClient: jest.fn(async () => null),
      upsertFullClient: jest.fn(async () => {}),
      deleteClient: jest.fn(async () => ({})),
      getLeadsByClient: jest.fn(async () => []),
      getCallsByTenant: jest.fn(async () => [])
    }));
    jest.unstable_mockModule('../../lib/admin-hub-data.js', () => ({
      getClientsData: jest.fn(async () => []),
      getCallsData: jest.fn(async () => ({}))
    }));

    const { createAdminClientsRouter } = await import('../../routes/admin-clients.js');
    const router = createAdminClientsRouter({ broadcast: () => {} });
    const app = createContractApp({ mounts: [{ path: '/api/admin', router }] });

    await request(app).get('/api/admin/client/c1').expect(404);
  });

  test('GET /api/admin/client/:clientKey returns stats when client exists', async () => {
    jest.unstable_mockModule('../../db.js', () => ({
      query: jest.fn(async () => ({ rows: [{ count: '3' }] })),
      listClientSummaries: jest.fn(async () => []),
      getFullClient: jest.fn(async () => ({ clientKey: 'c1', displayName: 'C1' })),
      upsertFullClient: jest.fn(async () => {}),
      deleteClient: jest.fn(async () => ({})),
      getLeadsByClient: jest.fn(async () => [{ id: 1 }, { id: 2 }]),
      getCallsByTenant: jest.fn(async () => [{ id: 1 }])
    }));
    jest.unstable_mockModule('../../lib/admin-hub-data.js', () => ({
      getClientsData: jest.fn(async () => []),
      getCallsData: jest.fn(async () => ({}))
    }));

    const { createAdminClientsRouter } = await import('../../routes/admin-clients.js');
    const router = createAdminClientsRouter({ broadcast: () => {} });
    const app = createContractApp({ mounts: [{ path: '/api/admin', router }] });

    const res = await request(app).get('/api/admin/client/c1').expect(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        clientKey: 'c1',
        stats: expect.objectContaining({
          totalLeads: 2,
          totalCalls: 1,
          totalBookings: 3
        })
      })
    );
  });

  test('GET /api/admin/client/:clientKey clamps leadsLimit and callsLimit to 1000', async () => {
    const getLeadsByClient = jest.fn(async () => []);
    const getCallsByTenant = jest.fn(async () => []);
    jest.unstable_mockModule('../../db.js', () => ({
      query: jest.fn(async () => ({ rows: [{ count: '0' }] })),
      listClientSummaries: jest.fn(async () => []),
      getFullClient: jest.fn(async () => ({ clientKey: 'c1', displayName: 'C1' })),
      upsertFullClient: jest.fn(async () => {}),
      deleteClient: jest.fn(async () => ({})),
      getLeadsByClient,
      getCallsByTenant
    }));
    jest.unstable_mockModule('../../lib/admin-hub-data.js', () => ({
      getClientsData: jest.fn(async () => []),
      getCallsData: jest.fn(async () => ({}))
    }));

    const { createAdminClientsRouter } = await import('../../routes/admin-clients.js');
    const router = createAdminClientsRouter({ broadcast: () => {} });
    const app = createContractApp({ mounts: [{ path: '/api/admin', router }] });

    await request(app).get('/api/admin/client/c1').query({ leadsLimit: '99999', callsLimit: '500' }).expect(200);
    expect(getLeadsByClient).toHaveBeenCalledWith('c1', 1000);
    expect(getCallsByTenant).toHaveBeenCalledWith('c1', 500);
  });
});

