import { describe, test, expect, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createAdminServerCallQueueRouter } from '../../routes/admin-server-call-queue-mount.js';

describe('routes/admin-server-call-queue-mount', () => {
  test('401 without X-API-Key', async () => {
    const app = express();
    app.use(express.json());
    app.use(
      createAdminServerCallQueueRouter({
        listFullClients: async () => [],
        query: jest.fn(),
        dbType: 'sqlite',
        loadDb: async () => ({}),
        getApiKey: () => 'secret',
      })
    );

    const res = await request(app).get('/admin/call-queue');
    expect(res.status).toBe(401);
  });

  test('happy: GET /admin/call-queue returns ok true', async () => {
    const app = express();
    app.use(express.json());
    app.use(
      createAdminServerCallQueueRouter({
        listFullClients: async () => [{ clientKey: 'c1', displayName: 'C1' }],
        query: jest.fn(),
        dbType: 'sqlite',
        loadDb: async () => ({
          getPendingCalls: async () => [{ id: 1 }],
          getCallQueueByTenant: async () => [{ id: 2 }],
        }),
        getApiKey: () => 'secret',
      })
    );

    const res = await request(app).get('/admin/call-queue').set('X-API-Key', 'secret');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({ ok: true }));
    expect(res.body.pendingCalls.length).toBe(1);
    expect(res.body.queueByTenant.c1.queue.length).toBe(1);
  });

  test('failure: POST /admin/pull-forward-call-queue returns 400 when not postgres', async () => {
    const app = express();
    app.use(express.json());
    app.use(
      createAdminServerCallQueueRouter({
        listFullClients: async () => [],
        query: jest.fn(),
        dbType: 'sqlite',
        loadDb: async () => ({}),
        getApiKey: () => 'secret',
      })
    );

    const res = await request(app)
      .post('/admin/pull-forward-call-queue')
      .set('X-API-Key', 'secret')
      .send({ clientKey: 'c1', limit: 10 });
    expect(res.status).toBe(400);
    expect(res.body).toEqual(expect.objectContaining({ ok: false, error: 'unsupported_db' }));
  });
});

