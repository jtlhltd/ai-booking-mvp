import { describe, test, expect, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

describe('routes/client-ops-mount', () => {
  test('happy: POST /api/onboard-client with api key returns onboard payload', async () => {
    const prev = process.env.API_KEY;
    process.env.API_KEY = 'secret';
    try {
      jest.resetModules();
      const onboardClient = jest.fn(async () => ({ ok: true, clientKey: 'ck1' }));
      jest.unstable_mockModule('../../lib/client-onboarding.js', () => ({
        onboardClient,
        updateClientConfig: jest.fn(),
      }));

      const { createClientOpsRouter } = await import('../../routes/client-ops-mount.js');
      const app = express();
      app.use(express.json());
      app.use(
        createClientOpsRouter({
          getFullClient: async () => null,
          runOutboundAbTestSetup: async () => {},
          runOutboundAbChallengerUpdate: async () => {},
          runOutboundAbDimensionStop: async () => {},
          isDashboardSelfServiceClient: () => false,
          isVapiOutboundAbExperimentOnlyPatch: () => false,
        }),
      );

      const res = await request(app)
        .post('/api/onboard-client')
        .set('X-API-Key', 'secret')
        .send({ businessName: 'Acme' })
        .expect(200);
      expect(res.body).toEqual({ ok: true, clientKey: 'ck1' });
      expect(onboardClient).toHaveBeenCalledWith({ businessName: 'Acme' });
    } finally {
      if (prev === undefined) delete process.env.API_KEY;
      else process.env.API_KEY = prev;
    }
  });

  test('failure: POST /api/onboard-client returns 401 without api key', async () => {
    const { createClientOpsRouter } = await import('../../routes/client-ops-mount.js');
    const app = express();
    app.use(express.json());
    app.use(
      createClientOpsRouter({
        getFullClient: async () => null,
        runOutboundAbTestSetup: async () => {},
        runOutboundAbChallengerUpdate: async () => {},
        runOutboundAbDimensionStop: async () => {},
        isDashboardSelfServiceClient: () => false,
        isVapiOutboundAbExperimentOnlyPatch: () => false,
      }),
    );
    await request(app).post('/api/onboard-client').send({}).expect(401);
  });

  test('failure: POST /api/clients/:clientKey/outbound-ab-test returns 401 without api key', async () => {
    const { createClientOpsRouter } = await import('../../routes/client-ops-mount.js');
    const app = express();
    app.use(express.json());
    app.use(
      createClientOpsRouter({
        getFullClient: async () => null,
        runOutboundAbTestSetup: async () => {},
        runOutboundAbChallengerUpdate: async () => {},
        runOutboundAbDimensionStop: async () => {},
        isDashboardSelfServiceClient: () => false,
        isVapiOutboundAbExperimentOnlyPatch: () => false,
      }),
    );
    const res = await request(app).post('/api/clients/c1/outbound-ab-test').send({});
    expect(res.status).toBe(401);
  });

  test('failure: POST /api/signup returns 400 when required fields missing', async () => {
    const { createClientOpsRouter } = await import('../../routes/client-ops-mount.js');
    const app = express();
    app.use(express.json());
    app.use(
      createClientOpsRouter({
        getFullClient: async () => null,
        runOutboundAbTestSetup: async () => {},
        runOutboundAbChallengerUpdate: async () => {},
        runOutboundAbDimensionStop: async () => {},
        isDashboardSelfServiceClient: () => false,
        isVapiOutboundAbExperimentOnlyPatch: () => false,
      }),
    );

    const res = await request(app).post('/api/signup').send({ businessName: 'Acme' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('happy: POST /api/signup returns clientKey/apiKey when onboarding succeeds', async () => {
    const createClient = jest.fn(async () => ({
      clientKey: 'c_new',
      businessName: 'Acme',
      ownerEmail: 'owner@acme.test',
      apiKey: 'ak_test',
      systemPrompt: 'prompt',
    }));
    const sendWelcomeEmail = jest.fn(async () => {});

    jest.unstable_mockModule('../../lib/auto-onboarding.js', () => ({
      createClient,
      sendWelcomeEmail,
    }));

    const { createClientOpsRouter } = await import('../../routes/client-ops-mount.js');
    const app = express();
    app.use(express.json());
    app.use(
      createClientOpsRouter({
        getFullClient: async () => null,
        runOutboundAbTestSetup: async () => {},
        runOutboundAbChallengerUpdate: async () => {},
        runOutboundAbDimensionStop: async () => {},
        isDashboardSelfServiceClient: () => false,
        isVapiOutboundAbExperimentOnlyPatch: () => false,
      }),
    );

    const payload = {
      businessName: 'Acme',
      industry: 'dental',
      primaryService: 'checkup',
      serviceArea: 'London',
      ownerName: 'Owner',
      email: 'owner@acme.test',
      phone: '+15551234567',
      monthlyLeads: 10,
    };

    const res = await request(app).post('/api/signup').send(payload).expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.clientKey).toBe('c_new');
    expect(res.body.apiKey).toBe('ak_test');
    expect(createClient).toHaveBeenCalled();
    expect(sendWelcomeEmail).toHaveBeenCalled();
  });

  test('failure: POST /api/signup returns 409 on duplicate business', async () => {
    jest.resetModules();
    const createClient = jest.fn(async () => {
      const e = new Error('dup');
      e.code = '23505';
      throw e;
    });
    const sendWelcomeEmail = jest.fn(async () => {});

    jest.unstable_mockModule('../../lib/auto-onboarding.js', () => ({
      createClient,
      sendWelcomeEmail,
    }));

    const { createClientOpsRouter } = await import('../../routes/client-ops-mount.js');
    const app = express();
    app.use(express.json());
    app.use(
      createClientOpsRouter({
        getFullClient: async () => null,
        runOutboundAbTestSetup: async () => {},
        runOutboundAbChallengerUpdate: async () => {},
        runOutboundAbDimensionStop: async () => {},
        isDashboardSelfServiceClient: () => false,
        isVapiOutboundAbExperimentOnlyPatch: () => false,
      }),
    );

    const payload = {
      businessName: 'Acme',
      industry: 'dental',
      primaryService: 'checkup',
      serviceArea: 'London',
      ownerName: 'Owner',
      email: 'owner@acme.test',
      phone: '+15551234567',
    };

    const res = await request(app).post('/api/signup').send(payload).expect(409);
    expect(res.body.success).toBe(false);
  });

  test('failure: POST /api/signup returns 500 when client_metadata table missing and create fails', async () => {
    jest.resetModules();

    const createClient = jest.fn(async () => {
      const e = new Error('missing');
      e.code = '42P01';
      throw e;
    });
    const sendWelcomeEmail = jest.fn(async () => {});

    const query = jest.fn(async () => {
      throw new Error('db locked');
    });

    jest.unstable_mockModule('../../lib/auto-onboarding.js', () => ({
      createClient,
      sendWelcomeEmail,
    }));
    jest.unstable_mockModule('../../db.js', () => ({ query }));

    const { createClientOpsRouter } = await import('../../routes/client-ops-mount.js');
    const app = express();
    app.use(express.json());
    app.use(
      createClientOpsRouter({
        getFullClient: async () => null,
        runOutboundAbTestSetup: async () => {},
        runOutboundAbChallengerUpdate: async () => {},
        runOutboundAbDimensionStop: async () => {},
        isDashboardSelfServiceClient: () => false,
        isVapiOutboundAbExperimentOnlyPatch: () => false,
      }),
    );

    const payload = {
      businessName: 'Acme',
      industry: 'dental',
      primaryService: 'checkup',
      serviceArea: 'London',
      ownerName: 'Owner',
      email: 'owner@acme.test',
      phone: '+15551234567',
    };

    const res = await request(app).post('/api/signup').send(payload).expect(500);
    expect(res.body.success).toBe(false);
  });

  test('failure: POST /api/signup returns 500 on unexpected createClient error', async () => {
    jest.resetModules();
    jest.unstable_mockModule('../../lib/auto-onboarding.js', () => ({
      createClient: jest.fn(async () => {
        throw new Error('provision_failed');
      }),
      sendWelcomeEmail: jest.fn(async () => {}),
    }));

    const { createClientOpsRouter } = await import('../../routes/client-ops-mount.js');
    const app = express();
    app.use(express.json());
    app.use(
      createClientOpsRouter({
        getFullClient: async () => null,
        runOutboundAbTestSetup: async () => {},
        runOutboundAbChallengerUpdate: async () => {},
        runOutboundAbDimensionStop: async () => {},
        isDashboardSelfServiceClient: () => false,
        isVapiOutboundAbExperimentOnlyPatch: () => false,
      }),
    );

    const payload = {
      businessName: 'Acme',
      industry: 'dental',
      primaryService: 'checkup',
      serviceArea: 'London',
      ownerName: 'Owner',
      email: 'owner@acme.test',
      phone: '+15551234567',
      monthlyLeads: 10,
    };

    const res = await request(app).post('/api/signup').send(payload).expect(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/try again|support/i);
  });
});

