import { describe, expect, test, jest } from '@jest/globals';
import request from 'supertest';

import { createContractApp } from '../helpers/contract-harness.js';
import { createClientDashboardDebugRouter } from '../../routes/client-dashboard-debug.js';

describe('routes/client-dashboard-debug', () => {
  test('GET /api/client-dashboard-debug/:clientKey returns diagnostics', async () => {
    const query = jest.fn(async () => ({
      rows: [{ call_id: 'c1', lead_phone: '+1', status: 'ended', outcome: null, created_at: new Date(), duration: 10 }]
    }));
    const router = createClientDashboardDebugRouter({ query, fetchImpl: async () => ({ ok: false }) });
    const app = createContractApp({ mounts: [{ path: '/api', router }] });
    const res = await request(app).get('/api/client-dashboard-debug/c1').expect(200);
    expect(res.body).toEqual(expect.objectContaining({ clientKey: 'c1', recentCallsCount: 1 }));
  });

  test('legacy /api/demo-dashboard-debug sets Deprecation header', async () => {
    const query = jest.fn(async () => ({ rows: [] }));
    const fetchImpl = jest.fn(async () => ({ ok: true, json: async () => ({ status: 'ended' }) }));
    const router = createClientDashboardDebugRouter({ query, fetchImpl });
    const app = createContractApp({ mounts: [{ path: '/api', router }] });
    const res = await request(app).get('/api/demo-dashboard-debug/c1').expect(200);
    expect(String(res.headers.deprecation || '')).toBe('true');
    expect(String(res.headers.link || '')).toMatch(/client-dashboard-debug/);
  });
});
