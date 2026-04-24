import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import request from 'supertest';

import { createContractApp } from '../helpers/contract-harness.js';

beforeEach(() => {
  jest.resetModules();
});

describe('routes/leads-followups recall contract (happy + failure)', () => {
  test('failure: POST /api/leads/recall rejects missing clientKey', async () => {
    const { createLeadsFollowupsRouter } = await import('../../routes/leads-followups.js');
    const app = createContractApp({
      mounts: [
        {
          path: '/api/leads',
          router: () =>
            createLeadsFollowupsRouter({
              getFullClient: async () => null,
              isBusinessHours: () => true,
              TIMEZONE: 'Europe/London'
            })
        }
      ]
    });

    const res = await request(app).post('/api/leads/recall').send({ lead: { phone: '+44' } }).expect(400);
    expect(res.body).toEqual(expect.objectContaining({ ok: false, error: 'missing clientKey' }));
  });

  test('failure: POST /api/leads/recall rejects outside business hours', async () => {
    const { createLeadsFollowupsRouter } = await import('../../routes/leads-followups.js');
    const app = createContractApp({
      mounts: [
        {
          path: '/api/leads',
          router: () =>
            createLeadsFollowupsRouter({
              getFullClient: async () => ({ clientKey: 'c1', displayName: 'C1' }),
              isBusinessHours: () => false,
              TIMEZONE: 'Europe/London',
              VAPI_PRIVATE_KEY: 'k',
              VAPI_ASSISTANT_ID: 'a1'
            })
        }
      ]
    });

    const res = await request(app)
      .post('/api/leads/recall')
      .send({ clientKey: 'c1', lead: { phone: '+447700900000' } })
      .expect(403);

    expect(res.body).toEqual(expect.objectContaining({ ok: false, error: 'outside_business_hours' }));
  });

  test('happy: POST /api/leads/recall returns 500 when Vapi missing config (explicit branch)', async () => {
    const { createLeadsFollowupsRouter } = await import('../../routes/leads-followups.js');
    const app = createContractApp({
      mounts: [
        {
          path: '/api/leads',
          router: () =>
            createLeadsFollowupsRouter({
              getFullClient: async () => ({ clientKey: 'c1', displayName: 'C1' }),
              isBusinessHours: () => true,
              TIMEZONE: 'Europe/London',
              VAPI_PRIVATE_KEY: ''
            })
        }
      ]
    });

    const res = await request(app)
      .post('/api/leads/recall')
      .send({ clientKey: 'c1', lead: { phone: '+447700900000' } })
      .expect(500);

    expect(res.body).toEqual(expect.objectContaining({ ok: false, error: 'Vapi not configured' }));
  });
});

