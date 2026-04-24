import { describe, expect, test } from '@jest/globals';
import request from 'supertest';

import { createContractApp } from '../helpers/contract-harness.js';

describe('routes/admin-call-queue low coverage sweep', () => {
  test('POST pull-forward returns 400 when not postgres', async () => {
    const { createAdminCallQueueRouter } = await import('../../routes/admin-call-queue.js');
    const router = createAdminCallQueueRouter({
      query: async () => ({ rows: [] }),
      getFullClient: async () => ({ clientKey: 'c1' }),
      pickTimezone: () => 'Europe/London',
      DateTime: (await import('luxon')).DateTime,
      TIMEZONE: 'UTC',
      isPostgres: false,
      pgQueueLeadPhoneKeyExpr: () => 'x',
      isBusinessHours: () => true
    });
    const app = createContractApp({ mounts: [{ path: '/api/admin', router }] });
    const res = await request(app).post('/api/admin/call-queue/pull-forward/c1').send({ limit: 1 }).expect(400);
    expect(res.body).toEqual(expect.objectContaining({ ok: false, error: 'postgres_required' }));
  });

  test('POST pull-forward returns 404 when client missing', async () => {
    const { createAdminCallQueueRouter } = await import('../../routes/admin-call-queue.js');
    const router = createAdminCallQueueRouter({
      query: async () => ({ rows: [] }),
      getFullClient: async () => null,
      pickTimezone: () => 'Europe/London',
      DateTime: (await import('luxon')).DateTime,
      TIMEZONE: 'UTC',
      isPostgres: true,
      pgQueueLeadPhoneKeyExpr: () => 'x',
      isBusinessHours: () => true
    });
    const app = createContractApp({ mounts: [{ path: '/api/admin', router }] });
    const res = await request(app).post('/api/admin/call-queue/pull-forward/c1').send({ limit: 1 }).expect(404);
    expect(res.body).toEqual(expect.objectContaining({ ok: false, error: 'client_not_found' }));
  });
});

