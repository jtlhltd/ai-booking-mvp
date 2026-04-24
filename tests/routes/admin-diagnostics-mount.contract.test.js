import { describe, test, expect } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createAdminDiagnosticsRouter } from '../../routes/admin-diagnostics-mount.js';

const deps = () => ({
      resolveTenantKeyFromInbound: async () => null,
      listFullClients: async () => [],
      loadDemoScript: async () => ({}),
      readDemoTelemetry: async () => [],
      clearDemoTelemetry: async () => {},
      readReceptionistTelemetry: async () => [],
      clearReceptionistTelemetry: async () => {},
      readJson: async () => [],
      LEADS_PATH: '/tmp',
      normalizePhoneE164: (p) => p,
      getFullClient: async () => null,
      calculateLeadScore: () => 0,
      getLeadPriority: () => 1,
});

describe('routes/admin-diagnostics-mount', () => {
  test('GET /admin/tenant-resolve 400 when to missing', async () => {
    const app = express();
    app.use(createAdminDiagnosticsRouter(deps()));
    const res = await request(app).get('/admin/tenant-resolve');
    expect(res.status).toBe(400);
  });

  test('GET /admin/tenant-resolve happy', async () => {
    const app = express();
    app.use(
      createAdminDiagnosticsRouter({
        ...deps(),
        resolveTenantKeyFromInbound: async () => 't1',
      })
    );
    const res = await request(app).get('/admin/tenant-resolve').query({ to: '+15550001111' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({ ok: true, tenantKey: 't1' }));
  });
});
