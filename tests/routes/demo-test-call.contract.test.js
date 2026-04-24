import { describe, expect, test } from '@jest/globals';
import request from 'supertest';

import { createContractApp } from '../helpers/contract-harness.js';
import { createDemoTestCallRouter } from '../../routes/demo-test-call.js';

describe('routes/demo-test-call', () => {
  test('400 when clientKey missing', async () => {
    const router = createDemoTestCallRouter({
      getFullClient: async () => null,
      isDemoClient: () => false,
      fetchImpl: async () => ({ ok: true, json: async () => ({}) })
    });
    const app = createContractApp({ mounts: [{ path: '/api', router }] });
    await request(app).post('/api/demo/test-call').send({}).expect(400);
  });

  test('404 when client missing', async () => {
    const router = createDemoTestCallRouter({
      getFullClient: async () => null,
      isDemoClient: () => false,
      fetchImpl: async () => ({ ok: true, json: async () => ({}) })
    });
    const app = createContractApp({ mounts: [{ path: '/api', router }] });
    await request(app).post('/api/demo/test-call').send({ clientKey: 'c1' }).expect(404);
  });

  test('403 when not demo and no assistant id', async () => {
    const router = createDemoTestCallRouter({
      getFullClient: async () => ({ clientKey: 'c1' }),
      isDemoClient: () => false,
      fetchImpl: async () => ({ ok: true, json: async () => ({}) })
    });
    const app = createContractApp({ mounts: [{ path: '/api', router }] });
    await request(app).post('/api/demo/test-call').send({ clientKey: 'c1' }).expect(403);
  });

  test('500 when VAPI_PRIVATE_KEY missing', async () => {
    const old = process.env.VAPI_PRIVATE_KEY;
    delete process.env.VAPI_PRIVATE_KEY;
    const router = createDemoTestCallRouter({
      getFullClient: async () => ({ clientKey: 'c1', assistantId: 'a1' }),
      isDemoClient: () => true,
      fetchImpl: async () => ({ ok: true, json: async () => ({}) })
    });
    const app = createContractApp({ mounts: [{ path: '/api', router }] });
    await request(app).post('/api/demo/test-call').send({ clientKey: 'c1' }).expect(500);
    process.env.VAPI_PRIVATE_KEY = old;
  });

  test('200 success triggers fetch', async () => {
    const old = process.env.VAPI_PRIVATE_KEY;
    process.env.VAPI_PRIVATE_KEY = 'k';
    const fetchImpl = async () => ({ ok: true, json: async () => ({ id: 'call1' }) });
    const router = createDemoTestCallRouter({
      getFullClient: async () => ({ clientKey: 'c1', assistantId: 'a1' }),
      isDemoClient: () => true,
      fetchImpl
    });
    const app = createContractApp({ mounts: [{ path: '/api', router }] });
    const res = await request(app).post('/api/demo/test-call').send({ clientKey: 'c1' }).expect(200);
    expect(res.body).toEqual(expect.objectContaining({ success: true, data: expect.any(Object) }));
    process.env.VAPI_PRIVATE_KEY = old;
  });
});

