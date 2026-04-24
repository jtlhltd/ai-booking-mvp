import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import request from 'supertest';

import { createContractApp, withEnv } from '../helpers/contract-harness.js';

beforeEach(() => {
  jest.resetModules();
});

describe('routes/backend-status.js contracts', () => {
  test('GET /api/migrations/status returns 401 when API key missing', async () => {
    await withEnv({ API_KEY: 'k1' }, async () => {
      const { default: router } = await import('../../routes/backend-status.js');
      const app = createContractApp({ mounts: [{ path: '/', router }] });
      await request(app).get('/api/migrations/status').expect(401);
    });
  });

  test('GET /api/backup-status returns ok=true', async () => {
    jest.unstable_mockModule('../../lib/backup-monitoring.js', () => ({
      verifyBackupSystem: jest.fn(async () => ({
        status: 'ok',
        message: 'ok',
        databaseAccessible: true,
        recentActivity: true,
        backupAge: 1,
        hasAnyData: true,
        hasActiveClients: true,
        totalClients: 1,
        hasPendingWork: false
      }))
    }));

    const { default: router } = await import('../../routes/backend-status.js');
    const app = createContractApp({ mounts: [{ path: '/', router }] });
    const res = await request(app).get('/api/backup-status').expect(200);
    expect(res.body).toEqual(expect.objectContaining({ ok: true, status: 'ok' }));
  });

  test('GET /api/cost-summary/:clientKey returns 500 when summary.success=false', async () => {
    jest.unstable_mockModule('../../lib/cost-monitoring.js', () => ({
      getCostSummary: jest.fn(async () => ({ success: false, error: 'nope' }))
    }));

    const { default: router } = await import('../../routes/backend-status.js');
    const app = createContractApp({ mounts: [{ path: '/', router }] });
    const res = await request(app).get('/api/cost-summary/c1').expect(500);
    expect(res.body).toEqual(expect.objectContaining({ ok: false, error: 'nope' }));
  });
});

