import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import request from 'supertest';

import { createContractApp, withIsolatedModulesAndEnv } from '../helpers/contract-harness.js';

beforeEach(() => {
  jest.resetModules();
});

describe('Health routes contracts', () => {
  test('GET /health returns 503 when status=critical', async () => {
    await withIsolatedModulesAndEnv(jest, {}, async () => {
      jest.unstable_mockModule('../../lib/health-check.js', () => ({
        performHealthCheck: jest.fn(async () => ({ status: 'critical' })),
        quickHealthCheck: jest.fn(() => ({ status: 'ok' })),
        readinessCheck: jest.fn(async () => ({ ready: true })),
        livenessCheck: jest.fn(() => ({ alive: true }))
      }));
      jest.unstable_mockModule('../../lib/structured-logger.js', () => ({
        getLogger: () => ({ error: jest.fn() })
      }));

      const { default: router } = await import('../../routes/health.js');
      const app = createContractApp({ mounts: [{ path: '/', router }] });
      const res = await request(app).get('/health').expect(503);
      expect(res.body).toEqual(expect.objectContaining({ status: 'critical' }));
    });
  });

  test('GET /health returns 200 when status=degraded', async () => {
    await withIsolatedModulesAndEnv(jest, {}, async () => {
      jest.unstable_mockModule('../../lib/health-check.js', () => ({
        performHealthCheck: jest.fn(async () => ({ status: 'degraded' })),
        quickHealthCheck: jest.fn(() => ({ status: 'ok' })),
        readinessCheck: jest.fn(async () => ({ ready: true })),
        livenessCheck: jest.fn(() => ({ alive: true }))
      }));
      jest.unstable_mockModule('../../lib/structured-logger.js', () => ({
        getLogger: () => ({ error: jest.fn() })
      }));

      const { default: router } = await import('../../routes/health.js');
      const app = createContractApp({ mounts: [{ path: '/', router }] });
      const res = await request(app).get('/health').expect(200);
      expect(res.body).toEqual(expect.objectContaining({ status: 'degraded' }));
    });
  });

  test('GET /health returns 503 with unhealthy payload when performHealthCheck throws', async () => {
    await withIsolatedModulesAndEnv(jest, {}, async () => {
      const loggerError = jest.fn();
      jest.unstable_mockModule('../../lib/health-check.js', () => ({
        performHealthCheck: jest.fn(async () => {
          throw new Error('boom');
        }),
        quickHealthCheck: jest.fn(() => ({ status: 'ok' })),
        readinessCheck: jest.fn(async () => ({ ready: true })),
        livenessCheck: jest.fn(() => ({ alive: true }))
      }));
      jest.unstable_mockModule('../../lib/structured-logger.js', () => ({
        getLogger: () => ({ error: loggerError })
      }));

      const { default: router } = await import('../../routes/health.js');
      const app = createContractApp({ mounts: [{ path: '/', router }] });
      const res = await request(app).get('/health').expect(503);
      expect(res.body).toEqual(
        expect.objectContaining({
          status: 'unhealthy',
          error: 'boom',
          timestamp: expect.any(String)
        })
      );
      expect(loggerError).toHaveBeenCalled();
    });
  });

  test('GET /health/readiness returns 503 when ready=false', async () => {
    await withIsolatedModulesAndEnv(jest, {}, async () => {
      jest.unstable_mockModule('../../lib/health-check.js', () => ({
        performHealthCheck: jest.fn(async () => ({ status: 'ok' })),
        quickHealthCheck: jest.fn(() => ({ status: 'ok' })),
        readinessCheck: jest.fn(async () => ({ ready: false })),
        livenessCheck: jest.fn(() => ({ alive: true }))
      }));
      jest.unstable_mockModule('../../lib/structured-logger.js', () => ({
        getLogger: () => ({ error: jest.fn() })
      }));

      const { default: router } = await import('../../routes/health.js');
      const app = createContractApp({ mounts: [{ path: '/', router }] });
      const res = await request(app).get('/health/readiness').expect(503);
      expect(res.body).toEqual(expect.objectContaining({ ready: false }));
    });
  });

  test('GET /health/liveness returns 503 when alive=false', async () => {
    await withIsolatedModulesAndEnv(jest, {}, async () => {
      jest.unstable_mockModule('../../lib/health-check.js', () => ({
        performHealthCheck: jest.fn(async () => ({ status: 'ok' })),
        quickHealthCheck: jest.fn(() => ({ status: 'ok' })),
        readinessCheck: jest.fn(async () => ({ ready: true })),
        livenessCheck: jest.fn(() => ({ alive: false }))
      }));
      jest.unstable_mockModule('../../lib/structured-logger.js', () => ({
        getLogger: () => ({ error: jest.fn() })
      }));

      const { default: router } = await import('../../routes/health.js');
      const app = createContractApp({ mounts: [{ path: '/', router }] });
      const res = await request(app).get('/health/liveness').expect(503);
      expect(res.body).toEqual(expect.objectContaining({ alive: false }));
    });
  });

  test('GET /healthz returns quick health payload', async () => {
    await withIsolatedModulesAndEnv(jest, {}, async () => {
      jest.unstable_mockModule('../../lib/health-check.js', () => ({
        performHealthCheck: jest.fn(async () => ({ status: 'ok' })),
        quickHealthCheck: jest.fn(() => ({ status: 'ok', source: 'quick' })),
        readinessCheck: jest.fn(async () => ({ ready: true })),
        livenessCheck: jest.fn(() => ({ alive: true }))
      }));
      jest.unstable_mockModule('../../lib/structured-logger.js', () => ({
        getLogger: () => ({ error: jest.fn() })
      }));

      const { default: router } = await import('../../routes/health.js');
      const app = createContractApp({ mounts: [{ path: '/', router }] });
      const res = await request(app).get('/healthz').expect(200);
      expect(res.body).toEqual({ status: 'ok', source: 'quick' });
    });
  });
});

