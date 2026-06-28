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

  test('POST /api/clients/:clientKey/outbound-sequence/stop requires API key', async () => {
    const { createClientOpsRouter } = await import('../../routes/client-ops-mount.js');
    const router = createClientOpsRouter({});
    const app = createContractApp({ mounts: [{ path: '/', router }] });
    await request(app)
      .post('/api/clients/c1/outbound-sequence/stop')
      .send({ leadPhone: '+447700900111' })
      .expect(401);
  });

  test('POST /api/clients/:clientKey/outbound-sequence/stop returns ok on success', async () => {
    const { createClientOpsRouter } = await import('../../routes/client-ops-mount.js');
    const router = createClientOpsRouter({
      getLeadSequenceState: jest.fn(async () => ({ status: 'active' })),
      updateLeadSequenceState: jest.fn(async () => ({ ok: true })),
      getCallQueueByPhone: jest.fn(async () => [
        { id: 1, status: 'pending', call_type: 'vapi_call', call_data: { triggerType: 'sequence_next' } },
      ]),
      updateCallQueueStatus: jest.fn(async () => {}),
      getLeadHandoffByPhone: jest.fn(async () => null),
      upsertLeadHandoff: jest.fn(async () => {}),
    });
    const app = createContractApp({ mounts: [{ path: '/', router }] });
    const res = await request(app)
      .post('/api/clients/c1/outbound-sequence/stop')
      .set('X-API-Key', 'secret')
      .send({ leadPhone: '+447700900111', actor: 'ops-user' })
      .expect(200);
    expect(res.body).toEqual(expect.objectContaining({
      ok: true,
      clientKey: 'c1',
      leadPhone: '+447700900111',
      status: 'abandoned',
      cancelledQueueRows: 1,
    }));
  });

  test('POST /api/clients/:clientKey/outbound-sequence/enrollment requires API key', async () => {
    const { createClientOpsRouter } = await import('../../routes/client-ops-mount.js');
    const router = createClientOpsRouter({});
    const app = createContractApp({ mounts: [{ path: '/', router }] });
    await request(app)
      .post('/api/clients/c1/outbound-sequence/enrollment')
      .send({ leadPhone: '+447700900111', enrolled: true })
      .expect(401);
  });

  test('POST /api/clients/:clientKey/outbound-sequence/enrollment returns ok on success', async () => {
    const prev = process.env.API_KEY;
    process.env.API_KEY = 'secret';
    const { createClientOpsRouter } = await import('../../routes/client-ops-mount.js');
    const router = createClientOpsRouter({
      query: jest.fn(async (sql) => {
        if (String(sql).includes('SELECT id')) {
          return { rows: [{ id: 1, phone: '+447700900111', leadDialContextJson: { outboundSequenceOptIn: false } }] };
        }
        return {
          rows: [{
            id: 1,
            phone: '+447700900111',
            leadDialContextJson: { variableValues: { outboundSequenceOptIn: true } },
          }],
        };
      }),
      getFullClient: jest.fn(async () => ({
        outboundSequence: {
          enabled: true,
          stages: [{
            id: 's1',
            firstMessage: 'Hi',
            systemMessage: 'Sys',
            requiredFields: ['decisionMakerName'],
            maxAttemptsInStage: 2,
            isFinal: true,
          }],
        },
      })),
    });
    const app = createContractApp({ mounts: [{ path: '/', router }] });
    const res = await request(app)
      .post('/api/clients/c1/outbound-sequence/enrollment')
      .set('X-API-Key', 'secret')
      .send({ leadPhone: '+447700900111', enrolled: true, actor: 'ops-user' })
      .expect(200);
    expect(res.body).toEqual(expect.objectContaining({
      ok: true,
      clientKey: 'c1',
      enrolled: true,
      sequenceOptedIn: true,
    }));
    process.env.API_KEY = prev;
  });

  test('POST /api/clients/:clientKey/outbound-sequence/enrollment/bulk requires API key', async () => {
    const { createClientOpsRouter } = await import('../../routes/client-ops-mount.js');
    const router = createClientOpsRouter({});
    const app = createContractApp({ mounts: [{ path: '/', router }] });
    await request(app)
      .post('/api/clients/c1/outbound-sequence/enrollment/bulk')
      .send({ leadPhones: ['+447700900111'], enrolled: true })
      .expect(401);
  });

  test('POST /api/clients/:clientKey/outbound-sequence/enrollment/bulk returns ok on success', async () => {
    const prev = process.env.API_KEY;
    process.env.API_KEY = 'secret';
    let selectCount = 0;
    const { createClientOpsRouter } = await import('../../routes/client-ops-mount.js');
    const router = createClientOpsRouter({
      query: jest.fn(async (sql) => {
        if (String(sql).includes('SELECT id')) {
          selectCount += 1;
          return {
            rows: [{
              id: selectCount,
              phone: `+44770090011${selectCount}`,
              leadDialContextJson: { outboundSequenceOptIn: false },
            }],
          };
        }
        return {
          rows: [{
            id: selectCount,
            phone: `+44770090011${selectCount}`,
            leadDialContextJson: { variableValues: { outboundSequenceOptIn: true } },
          }],
        };
      }),
      getFullClient: jest.fn(async () => ({
        outboundSequence: {
          enabled: true,
          stages: [{
            id: 's1',
            firstMessage: 'Hi',
            systemMessage: 'Sys',
            requiredFields: ['decisionMakerName'],
            maxAttemptsInStage: 2,
            isFinal: true,
          }],
        },
      })),
    });
    const app = createContractApp({ mounts: [{ path: '/', router }] });
    const res = await request(app)
      .post('/api/clients/c1/outbound-sequence/enrollment/bulk')
      .set('X-API-Key', 'secret')
      .send({ leadPhones: ['+447700900111', '+447700900112'], enrolled: true, actor: 'ops-user' })
      .expect(200);
    expect(res.body).toEqual(expect.objectContaining({
      ok: true,
      clientKey: 'c1',
      requested: 2,
      updated: 2,
    }));
    process.env.API_KEY = prev;
  });

  test('POST /api/clients/:clientKey/outbound-sequence/salvage-dismiss returns ok on success', async () => {
    const { createClientOpsRouter } = await import('../../routes/client-ops-mount.js');
    const router = createClientOpsRouter({
      getLeadHandoffByPhone: jest.fn(async () => ({
        leadPhone: '+447700900111',
        source: 'vapi_webhook.sequence_abandoned',
        dataJson: '{}',
      })),
      upsertLeadHandoff: jest.fn(async () => {}),
    });
    const app = createContractApp({ mounts: [{ path: '/', router }] });
    const res = await request(app)
      .post('/api/clients/c1/outbound-sequence/salvage-dismiss')
      .set('X-API-Key', 'secret')
      .send({ leadPhone: '+447700900111', actor: 'ops-user' })
      .expect(200);
    expect(res.body).toEqual(expect.objectContaining({
      ok: true,
      clientKey: 'c1',
      leadPhone: '+447700900111',
      source: 'vapi_webhook.sequence_abandoned',
    }));
  });

  test('GET /api/clients/:clientKey/vapi/assistants returns 401 without API key', async () => {
    const { createClientOpsRouter } = await import('../../routes/client-ops-mount.js');
    const router = createClientOpsRouter({ getFullClient: jest.fn(async () => ({})) });
    const app = createContractApp({ mounts: [{ path: '/', router }] });
    await request(app).get('/api/clients/c1/vapi/assistants').expect(401);
  });

  test('GET /api/clients/:clientKey/vapi/assistants returns list', async () => {
    jest.unstable_mockModule('../../lib/vapi-assistant-admin.js', () => ({
      getVapiPrivateKey: () => 'k',
      listVapiAssistants: jest.fn(async () => [{ id: 'asst_1', name: 'Terry', firstMessage: 'Hi' }]),
      summarizeAssistant: (a) => ({ id: a.id, name: a.name, firstMessagePreview: a.firstMessage, updatedAt: null }),
    }));
    const { createClientOpsRouter } = await import('../../routes/client-ops-mount.js');
    const router = createClientOpsRouter({
      getFullClient: jest.fn(async () => ({ clientKey: 'c1', vapi: { assistantId: 'asst_1' } })),
    });
    const app = createContractApp({ mounts: [{ path: '/', router }] });
    const res = await request(app)
      .get('/api/clients/c1/vapi/assistants')
      .set('X-API-Key', 'secret')
      .expect(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        ok: true,
        currentAssistantId: 'asst_1',
        assistants: [{ id: 'asst_1', name: 'Terry', firstMessagePreview: 'Hi', updatedAt: null }],
      }),
    );
  });

  test('PATCH /api/clients/:clientKey/vapi/active-assistant updates tenant config', async () => {
    jest.unstable_mockModule('../../lib/vapi-assistant-admin.js', () => ({
      getVapiPrivateKey: () => 'k',
      assistantExistsInOrg: jest.fn(async () => true),
    }));
    jest.unstable_mockModule('../../lib/client-onboarding.js', () => ({
      updateClientConfig: jest.fn(async () => ({
        ok: true,
        client: { clientKey: 'c1', vapi: { assistantId: 'asst_2' } },
      })),
    }));
    const { createClientOpsRouter } = await import('../../routes/client-ops-mount.js');
    const router = createClientOpsRouter({
      getFullClient: jest.fn(async () => ({ clientKey: 'c1', vapi: { assistantId: 'asst_1' } })),
    });
    const app = createContractApp({ mounts: [{ path: '/', router }] });
    const res = await request(app)
      .patch('/api/clients/c1/vapi/active-assistant')
      .set('X-API-Key', 'secret')
      .send({ assistantId: 'asst_2' })
      .expect(200);
    expect(res.body).toEqual(
      expect.objectContaining({ ok: true, currentAssistantId: 'asst_2' }),
    );
  });
});

