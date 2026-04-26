import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import request from 'supertest';
import { createContractApp } from '../helpers/contract-harness.js';

beforeEach(() => {
  jest.resetModules();
  process.env.API_KEY = 'secret';
});

describe('client-ops-mount contract coverage', () => {
  test('POST /api/onboard-client returns 401 without API key', async () => {
    const { createClientOpsRouter } = await import('../../routes/client-ops-mount.js');
    const router = createClientOpsRouter({});
    const app = createContractApp({ mounts: [{ path: '/', router }] });
    await request(app).post('/api/onboard-client').send({}).expect(401);
  });

  test('POST /api/onboard-client returns 500 when onboardClient throws', async () => {
    jest.unstable_mockModule('../../lib/client-onboarding.js', () => ({
      onboardClient: jest.fn(async () => {
        throw new Error('boom');
      }),
      updateClientConfig: jest.fn(async () => ({})),
    }));
    const { createClientOpsRouter } = await import('../../routes/client-ops-mount.js');
    const router = createClientOpsRouter({});
    const app = createContractApp({ mounts: [{ path: '/', router }] });

    const res = await request(app)
      .post('/api/onboard-client')
      .set('X-API-Key', 'secret')
      .send({ clientKey: 'c1' })
      .expect(500);
    expect(res.body).toEqual(expect.objectContaining({ ok: false, error: 'boom' }));
  });

  test('PATCH /api/clients/:clientKey/config returns 401 when not authorized', async () => {
    const { createClientOpsRouter } = await import('../../routes/client-ops-mount.js');
    const router = createClientOpsRouter({
      isDashboardSelfServiceClient: () => false,
      isVapiOutboundAbExperimentOnlyPatch: () => false,
    });
    const app = createContractApp({ mounts: [{ path: '/', router }] });
    await request(app).patch('/api/clients/c1/config').send({}).expect(401);
  });

  test('PATCH /api/clients/:clientKey/config self-service returns 423 when review pending', async () => {
    jest.unstable_mockModule('../../lib/outbound-ab-review-lock.js', () => ({
      isOutboundAbReviewPending: () => true,
      OUTBOUND_AB_REVIEW_PENDING_MESSAGE: 'locked',
    }));
    jest.unstable_mockModule('../../lib/client-onboarding.js', () => ({
      updateClientConfig: jest.fn(async () => ({ ok: true })),
      onboardClient: jest.fn(async () => ({})),
    }));

    const { createClientOpsRouter } = await import('../../routes/client-ops-mount.js');
    const router = createClientOpsRouter({
      getFullClient: jest.fn(async () => ({ vapi: { any: 1 } })),
      isDashboardSelfServiceClient: () => true,
      isVapiOutboundAbExperimentOnlyPatch: () => true,
    });
    const app = createContractApp({ mounts: [{ path: '/', router }] });

    const res = await request(app).patch('/api/clients/c1/config').send({ vapi: { ab: 1 } }).expect(423);
    expect(res.body).toEqual({ ok: false, error: 'locked' });
  });

  test('PATCH /api/clients/:clientKey/config returns updateClientConfig result', async () => {
    jest.unstable_mockModule('../../lib/outbound-ab-review-lock.js', () => ({
      isOutboundAbReviewPending: () => false,
      OUTBOUND_AB_REVIEW_PENDING_MESSAGE: 'locked',
    }));
    const updateClientConfig = jest.fn(async () => ({ ok: true }));
    jest.unstable_mockModule('../../lib/client-onboarding.js', () => ({
      updateClientConfig,
      onboardClient: jest.fn(async () => ({})),
    }));

    const { createClientOpsRouter } = await import('../../routes/client-ops-mount.js');
    const router = createClientOpsRouter({
      getFullClient: jest.fn(async () => ({ vapi: {} })),
      isDashboardSelfServiceClient: () => true,
      isVapiOutboundAbExperimentOnlyPatch: () => true,
    });
    const app = createContractApp({ mounts: [{ path: '/', router }] });

    const res = await request(app).patch('/api/clients/c1/config').send({ vapi: { ab: 1 } }).expect(200);
    expect(res.body).toEqual({ ok: true });
    expect(updateClientConfig).toHaveBeenCalled();
  });

  test('POST /api/clients/:clientKey/outbound-ab-test returns 401 without key/self-service', async () => {
    const { createClientOpsRouter } = await import('../../routes/client-ops-mount.js');
    const router = createClientOpsRouter({
      isDashboardSelfServiceClient: () => false,
      runOutboundAbTestSetup: jest.fn(),
    });
    const app = createContractApp({ mounts: [{ path: '/', router }] });
    await request(app).post('/api/clients/c1/outbound-ab-test').send({}).expect(401);
  });

  test('POST /api/clients/:clientKey/outbound-ab-test calls runOutboundAbTestSetup', async () => {
    const runOutboundAbTestSetup = jest.fn(async (_clientKey, _body, res) => res.json({ ok: true }));
    const { createClientOpsRouter } = await import('../../routes/client-ops-mount.js');
    const router = createClientOpsRouter({
      isDashboardSelfServiceClient: () => true,
      runOutboundAbTestSetup,
    });
    const app = createContractApp({ mounts: [{ path: '/', router }] });
    const res = await request(app).post('/api/clients/c1/outbound-ab-test').send({}).expect(200);
    expect(res.body).toEqual({ ok: true });
  });

  test('POST /api/clients/:clientKey/outbound-ab-test-import returns 400 when json missing', async () => {
    const { createClientOpsRouter } = await import('../../routes/client-ops-mount.js');
    const router = createClientOpsRouter({ isDashboardSelfServiceClient: () => true });
    const app = createContractApp({ mounts: [{ path: '/', router }] });
    await request(app).post('/api/clients/c1/outbound-ab-test-import').send({ dimension: 'x' }).expect(400);
  });

  test('POST /api/clients/:clientKey/outbound-ab-test-import returns 400 on invalid JSON', async () => {
    jest.unstable_mockModule('../../lib/outbound-ab-upload-spec.js', () => ({
      parseOutboundAbUploadSpec: () => {
        throw new Error('invalid upload spec');
      },
    }));
    const { createClientOpsRouter } = await import('../../routes/client-ops-mount.js');
    const router = createClientOpsRouter({
      isDashboardSelfServiceClient: () => true,
      runOutboundAbTestSetup: jest.fn(),
      nanoid: () => 'n1',
      createABTestExperiment: jest.fn(),
      invalidateClientCache: jest.fn(),
      runOutboundAbChallengerUpdate: jest.fn(),
      runOutboundAbDimensionStop: jest.fn(),
      isVapiOutboundAbExperimentOnlyPatch: () => true,
      getFullClient: jest.fn(async () => ({ vapi: {} })),
    });
    const app = createContractApp({ mounts: [{ path: '/', router }] });

    const res = await request(app)
      .post('/api/clients/c1/outbound-ab-test-import')
      .send({ dimension: 'x', json: '{nope' })
      .expect(400);
    expect(res.body).toEqual(expect.objectContaining({ ok: false }));
  });
});

