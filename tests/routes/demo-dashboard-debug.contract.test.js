import { describe, expect, test } from '@jest/globals';
import request from 'supertest';

import { createContractApp } from '../helpers/contract-harness.js';
import { createDemoDashboardDebugRouter } from '../../routes/demo-dashboard-debug.js';

describe('routes/demo-dashboard-debug', () => {
  test('returns hasVapiKey false when no env key', async () => {
    const old1 = process.env.VAPI_PRIVATE_KEY;
    const old2 = process.env.VAPI_PUBLIC_KEY;
    delete process.env.VAPI_PRIVATE_KEY;
    delete process.env.VAPI_PUBLIC_KEY;

    const query = async () => ({ rows: [{ call_id: null, outcome: null, status: 'ended' }] });
    const router = createDemoDashboardDebugRouter({ query, fetchImpl: async () => ({ ok: false }) });
    const app = createContractApp({ mounts: [{ path: '/api', router }] });
    const res = await request(app).get('/api/demo-dashboard-debug/c1').expect(200);
    expect(res.body).toEqual(expect.objectContaining({ clientKey: 'c1', hasVapiKey: false }));

    process.env.VAPI_PRIVATE_KEY = old1;
    process.env.VAPI_PUBLIC_KEY = old2;
  });

  test('fetches vapi for rows needing outcome when key present', async () => {
    const old1 = process.env.VAPI_PRIVATE_KEY;
    process.env.VAPI_PRIVATE_KEY = 'k';

    const query = async () => ({ rows: [{ call_id: 'call1', outcome: null, status: 'ended', lead_phone: '+1' }] });
    const fetchImpl = async () => ({ ok: true, status: 200, statusText: 'OK', json: async () => ({ status: 'ended' }) });
    const router = createDemoDashboardDebugRouter({ query, fetchImpl });
    const app = createContractApp({ mounts: [{ path: '/api', router }] });
    const res = await request(app).get('/api/demo-dashboard-debug/c1').expect(200);
    expect(res.body.vapiFallbackResults.length).toBe(1);

    process.env.VAPI_PRIVATE_KEY = old1;
  });
});

