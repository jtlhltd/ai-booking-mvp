import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';

beforeEach(() => {
  jest.resetModules();
  delete process.env.API_KEY;
  delete process.env.VAPI_PRIVATE_KEY;
  delete process.env.VAPI_ASSISTANT_ID;
  delete process.env.VAPI_PHONE_NUMBER_ID;
});

describe('batch3: admin/client ops hotspot routes', () => {
  test('admin-clients-health-mount: clients list + details + system health + metrics', async () => {
    process.env.API_KEY = 'k';
    process.env.VAPI_PRIVATE_KEY = 'vk';
    process.env.VAPI_ASSISTANT_ID = 'asst1';

    const loadDb = jest.fn(async () => ({
      listFullClients: jest.fn(async () => [
        { key: 'c1', clientKey: 'c1', displayName: 'C1', leads: [{ phone: '+1', createdAt: new Date().toISOString() }] }
      ]),
      getLeadsByClient: jest.fn(async () => [{ phone: '+1', createdAt: new Date().toISOString() }]),
      getCallsByTenant: jest.fn(async () => [{ tenantKey: 'c1', leadPhone: '+1', createdAt: new Date().toISOString(), status: 'completed', outcome: 'booked', duration: 10, cost: 0.1 }])
    }));

    global.fetch = jest.fn(async () => ({ ok: true, status: 200 }));

    const { createAdminClientsHealthRouter } = await import('../../routes/admin-clients-health-mount.js');
    const router = createAdminClientsHealthRouter({
      getApiKey: () => 'k',
      loadDb,
      getFullClient: jest.fn(async (key) => (key === 'c1' ? { clientKey: 'c1', displayName: 'C1', sms: { fromNumber: '+1' } } : null)),
      listFullClients: jest.fn(async () => [{ clientKey: 'c1', displayName: 'C1', sms: { fromNumber: '+1' }, leads: [{ phone: '+1', createdAt: new Date().toISOString() }] }]),
      upsertFullClient: jest.fn(async () => ({})),
      normalizePhoneE164: (p) => p,
      calculateLeadScore: () => 80,
      query: jest.fn(async () => ({ rows: [{ pending_total: 0, due_now_total: 0, processing_total: 0, next_scheduled_for: null }] })),
      isPostgres: true,
      TWILIO_ACCOUNT_SID: '',
      TWILIO_AUTH_TOKEN: '',
    });

    const app = express();
    app.use(express.json());
    app.use(router);

    await request(app).get('/admin/clients').expect(401);
    const listRes = await request(app).get('/admin/clients').set('X-API-Key', 'k').expect(200);
    expect(listRes.body).toEqual(expect.objectContaining({ ok: true, totalClients: 1 }));

    const detailRes = await request(app).get('/admin/clients/c1').set('X-API-Key', 'k').expect(200);
    expect(detailRes.body).toEqual(expect.objectContaining({ ok: true, client: expect.objectContaining({ clientKey: 'c1' }) }));

    const healthRes = await request(app).get('/admin/system-health').set('X-API-Key', 'k').expect(200);
    expect(healthRes.body).toEqual(expect.objectContaining({ ok: true, status: expect.any(String) }));

    const metricsRes = await request(app).get('/admin/metrics').set('X-API-Key', 'k').expect(200);
    expect(metricsRes.body).toEqual(expect.objectContaining({ ok: true }));
  });

  test('client-ops-mount: config patch rejects unauthorized + self-service lock returns 423', async () => {
    process.env.API_KEY = 'k';
    jest.unstable_mockModule('../../lib/outbound-ab-review-lock.js', () => ({
      isOutboundAbReviewPending: () => true,
      OUTBOUND_AB_REVIEW_PENDING_MESSAGE: 'Review pending'
    }));
    jest.unstable_mockModule('../../lib/client-onboarding.js', () => ({
      updateClientConfig: jest.fn(async () => ({ ok: true }))
    }));

    const { createClientOpsRouter } = await import('../../routes/client-ops-mount.js');
    const router = createClientOpsRouter({
      getFullClient: jest.fn(async () => ({ vapi: { outboundAbReviewPending: '1' } })),
      nanoid: () => 'id1',
      createABTestExperiment: jest.fn(async () => ({})),
      invalidateClientCache: jest.fn(() => {}),
      runOutboundAbTestSetup: jest.fn(async (_clientKey, _body, res) => res.json({ ok: true })),
      runOutboundAbChallengerUpdate: jest.fn(async (_clientKey, _body, res) => res.json({ ok: true })),
      runOutboundAbDimensionStop: jest.fn(async (_clientKey, _dim, res) => res.json({ ok: true })),
      isDashboardSelfServiceClient: (clientKey) => clientKey === 'c1',
      isVapiOutboundAbExperimentOnlyPatch: () => true
    });

    const app = express();
    app.use(express.json());
    app.use(router);

    // Not a self-service client and no API key → 401
    await request(app).patch('/api/clients/nope/config').send({ vapi: { outboundAbVoiceExperiment: 'x' } }).expect(401);
    const locked = await request(app)
      .patch('/api/clients/c1/config')
      .send({ vapi: { outboundAbVoiceExperiment: 'x' } })
      .expect(423);
    expect(locked.body).toEqual(expect.objectContaining({ ok: false, error: 'Review pending' }));
  });

  test('admin-vapi-campaigns-mount: lead scoring + follow-up sequence happy paths', async () => {
    process.env.API_KEY = 'k';
    const { createAdminVapiCampaignsRouter } = await import('../../routes/admin-vapi-campaigns-mount.js');
    const router = createAdminVapiCampaignsRouter({
      getApiKey: () => 'k',
      startColdCallCampaign: jest.fn(async () => ({ ok: true })),
      getOptimalCallTime: () => '09:00-10:00',
      generateFollowUpPlan: () => ({ steps: [] }),
      generateVoicemailFollowUpEmail: () => ({ subject: 's', body: 'b' }),
      generateDemoConfirmationEmail: () => ({ subject: 's', body: 'b' }),
      generateObjectionHandlingEmail: () => ({ subject: 's', body: 'b' }),
      generatePersonalizedScript: () => ({ firstMessage: 'hi', systemMessage: 'sys' }),
    });

    const app = express();
    app.use(express.json());
    app.use(router);

    await request(app).post('/admin/vapi/lead-scoring').send({ businesses: [] }).expect(401);
    const scored = await request(app)
      .post('/admin/vapi/lead-scoring')
      .set('X-API-Key', 'k')
      .send({ businesses: [{ name: 'Biz', phone: '+1', website: 'https://x', address: 'London', services: ['a'], decisionMaker: { name: 'DM' }, rating: '4.5' }] })
      .expect(200);
    expect(scored.body).toEqual(expect.objectContaining({ success: true, totalBusinesses: 1 }));

    const followUps = await request(app)
      .post('/admin/vapi/follow-up-sequence')
      .set('X-API-Key', 'k')
      .send({ campaignId: 'cmp1', callResults: [{ businessId: 'b1', businessName: 'Biz', phone: '+1', email: 'a@b.com', outcome: 'voicemail' }] })
      .expect(200);
    expect(followUps.body).toEqual(expect.objectContaining({ success: true, totalFollowUps: 1 }));
  });
});

