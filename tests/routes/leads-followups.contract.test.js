import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import request from 'supertest';

import { createContractApp, withEnv } from '../helpers/contract-harness.js';

beforeEach(() => {
  jest.resetModules();
  global.fetch = undefined;
});

describe('routes/leads-followups.js contracts', () => {
  test('POST /api/leads/recall returns 400 when clientKey missing', async () => {
    const { createLeadsFollowupsRouter } = await import('../../routes/leads-followups.js');
    const router = createLeadsFollowupsRouter({
      getClientFromHeader: jest.fn(),
      readJson: jest.fn(),
      writeJson: jest.fn(),
      LEADS_PATH: 'x',
      getFullClient: jest.fn(),
      isBusinessHours: jest.fn(),
      TIMEZONE: 'Europe/London',
      smsConfig: jest.fn()
    });
    const app = createContractApp({ mounts: [{ path: '/api/leads', router }] });
    const res = await request(app).post('/api/leads/recall').send({}).expect(400);
    expect(res.body).toEqual({ ok: false, error: 'missing clientKey' });
  });

  test('POST /api/leads/recall returns 403 outside business hours', async () => {
    const { createLeadsFollowupsRouter } = await import('../../routes/leads-followups.js');
    const router = createLeadsFollowupsRouter({
      getFullClient: jest.fn(async () => ({ clientKey: 'c1', displayName: 'Acme', booking: { timezone: 'Europe/London' } })),
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
      .send({ clientKey: 'c1', lead: { phone: '+441', name: 'L' } })
      .expect(403);
    expect(res.body).toEqual(expect.objectContaining({ ok: false, error: 'outside_business_hours' }));
  });

  test('POST /api/leads/recall returns 500 when Vapi not configured', async () => {
    const { createLeadsFollowupsRouter } = await import('../../routes/leads-followups.js');
    const router = createLeadsFollowupsRouter({
      getFullClient: jest.fn(async () => ({ clientKey: 'c1', displayName: 'Acme' })),
      isBusinessHours: jest.fn(() => true),
      TIMEZONE: 'Europe/London',
      VAPI_PRIVATE_KEY: '',
      VAPI_ASSISTANT_ID: '',
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
      .expect(500);
    expect(res.body).toEqual(expect.objectContaining({ ok: false, error: 'Vapi not configured' }));
  });

  test('happy: POST /api/leads/recall enqueues and returns scheduledFor', async () => {
    await withEnv({}, async () => {
      jest.unstable_mockModule('../../db.js', () => ({
        addToCallQueue: jest.fn(async () => {}),
        getLatestCallInsights: jest.fn(async () => ({ routing: { recommendations: { bestHours: [{ hour: 10, score: 1 }] } } })),
        getCallTimeBanditState: jest.fn(async () => ({}))
      }));
      jest.unstable_mockModule('../../lib/optimal-call-window.js', () => ({
        scheduleAtOptimalCallWindow: jest.fn(async () => new Date('2030-01-01T10:00:00Z'))
      }));

      const { createLeadsFollowupsRouter } = await import('../../routes/leads-followups.js');
      const router = createLeadsFollowupsRouter({
        getFullClient: jest.fn(async () => ({ clientKey: 'c1', displayName: 'Acme', booking: { timezone: 'Europe/London' } })),
        isBusinessHours: jest.fn(() => true),
        TIMEZONE: 'Europe/London',
        VAPI_PRIVATE_KEY: 'k',
        VAPI_ASSISTANT_ID: 'a1',
        VAPI_PHONE_NUMBER_ID: 'p1',
        readJson: jest.fn(),
        writeJson: jest.fn(),
        LEADS_PATH: 'x',
        getClientFromHeader: jest.fn(),
        smsConfig: jest.fn()
      });
      const app = createContractApp({ mounts: [{ path: '/api/leads', router }] });
      const res = await request(app)
        .post('/api/leads/recall')
        .send({ clientKey: 'c1', lead: { phone: '+441234', name: 'L' } })
        .expect(200);
      expect(res.body).toEqual(expect.objectContaining({ ok: true, queued: true, scheduledFor: '2030-01-01T10:00:00.000Z' }));
    });
  });
});

