import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import request from 'supertest';

import { createContractApp, withEnv } from '../helpers/contract-harness.js';

beforeEach(() => {
  jest.resetModules();
  delete global.isShuttingDown;
});

describe('routes/health-and-diagnostics.js contracts', () => {
  test('GET /call-status reports missing Vapi vars', async () => {
    await withEnv({ VAPI_PRIVATE_KEY: undefined, VAPI_ASSISTANT_ID: undefined, VAPI_PHONE_NUMBER_ID: undefined }, async () => {
      jest.unstable_mockModule('../../lib/circuit-breaker.js', () => ({
        isCircuitBreakerOpen: jest.fn(() => false)
      }));

      const { createHealthAndDiagnosticsRouter } = await import('../../routes/health-and-diagnostics.js');
      const router = createHealthAndDiagnosticsRouter({ query: jest.fn() });
      const app = createContractApp({ mounts: [{ path: '/', router }] });

      const res = await request(app).get('/call-status').expect(200);
      expect(res.body).toEqual(
        expect.objectContaining({
          vapiConfigured: false,
          missingVars: expect.arrayContaining(['VAPI_PRIVATE_KEY', 'VAPI_ASSISTANT_ID', 'VAPI_PHONE_NUMBER_ID'])
        })
      );
    });
  });

  test('GET /health/lb returns 503 when db unhealthy', async () => {
    const { createHealthAndDiagnosticsRouter } = await import('../../routes/health-and-diagnostics.js');
    const router = createHealthAndDiagnosticsRouter({
      query: jest.fn(async () => {
        throw new Error('nope');
      })
    });
    const app = createContractApp({ mounts: [{ path: '/', router }] });
    const res = await request(app).get('/health/lb').expect(503);
    expect(res.body).toEqual(expect.objectContaining({ status: 'unhealthy', reason: 'database_unavailable' }));
  });

  test('GET /health/lb returns 503 when shutting down', async () => {
    global.isShuttingDown = true;
    const { createHealthAndDiagnosticsRouter } = await import('../../routes/health-and-diagnostics.js');
    const router = createHealthAndDiagnosticsRouter({ query: jest.fn(async () => ({})) });
    const app = createContractApp({ mounts: [{ path: '/', router }] });
    const res = await request(app).get('/health/lb').expect(503);
    expect(res.body).toEqual(expect.objectContaining({ status: 'unhealthy', reason: 'shutting_down' }));
  });
});

