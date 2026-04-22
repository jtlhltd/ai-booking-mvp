import { describe, expect, test, jest } from '@jest/globals';
import request from 'supertest';

import { createContractApp } from '../helpers/contract-harness.js';

jest.unstable_mockModule('../../db.js', () => ({
  query: jest.fn(async () => ({ rows: [{ ok: 1 }] }))
}));

describe('Admin operations contracts', () => {
  test('GET /api/admin/system/metrics returns system metrics shape', async () => {
    const { createAdminOperationsRouter } = await import('../../routes/admin-operations.js');
    const app = createContractApp({
      mounts: [{ path: '/api/admin', router: () => createAdminOperationsRouter({ io: { engine: { clientsCount: 2 } } }) }]
    });

    const res = await request(app).get('/api/admin/system/metrics').expect(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        memory: expect.any(Object),
        uptime: expect.any(Number),
        cpu: expect.any(Object),
        timestamp: expect.any(String)
      })
    );
  });

  test('GET /api/admin/system/health-check returns services health shape', async () => {
    const { createAdminOperationsRouter } = await import('../../routes/admin-operations.js');
    const app = createContractApp({
      mounts: [{ path: '/api/admin', router: () => createAdminOperationsRouter({ io: { engine: { clientsCount: 0 } } }) }]
    });

    const res = await request(app).get('/api/admin/system/health-check').expect(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        status: expect.any(String),
        timestamp: expect.any(String),
        services: expect.objectContaining({
          database: expect.any(String),
          websocket: expect.any(String),
          api: expect.any(String)
        }),
        metrics: expect.objectContaining({
          memoryUsage: expect.any(Object),
          uptime: expect.any(Number),
          activeConnections: expect.any(Number)
        })
      })
    );
  });
});

