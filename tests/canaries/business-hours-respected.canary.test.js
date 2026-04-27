/**
 * Canary for Intent Contract: dial.business-hours-respected
 *
 * Recalls outside business hours must be rejected with 403 outside_business_hours.
 */
import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import request from 'supertest';

import { createContractApp } from '../helpers/contract-harness.js';

beforeEach(() => {
  jest.resetModules();
  global.fetch = jest.fn(async () => {
    throw new Error('canary saw an unexpected fetch — recall must not dial directly');
  });
});

describe('canary: dial.business-hours-respected', () => {
  test('POST /api/leads/recall returns 403 outside_business_hours', async () => {
    const { createLeadsFollowupsRouter } = await import('../../routes/leads-followups.js');
    const router = createLeadsFollowupsRouter({
      getFullClient: jest.fn(async () => ({
        clientKey: 'c1',
        displayName: 'Acme',
        booking: { timezone: 'Europe/London' }
      })),
      isBusinessHours: jest.fn(() => false),
      TIMEZONE: 'Europe/London',
      VAPI_PRIVATE_KEY: 'k',
      VAPI_ASSISTANT_ID: 'a1',
      readJson: jest.fn(),
      writeJson: jest.fn(),
      LEADS_PATH: 'x',
      getClientFromHeader: jest.fn(),
      smsConfig: jest.fn()
    });

    const app = createContractApp({ mounts: [{ path: '/api/leads', router }] });
    const res = await request(app)
      .post('/api/leads/recall')
      .send({ clientKey: 'c1', lead: { phone: '+441' } })
      .expect(403);

    expect(res.body).toEqual(expect.objectContaining({ ok: false, error: 'outside_business_hours' }));
  });
});

