import { describe, expect, test, jest } from '@jest/globals';
import request from 'supertest';

import { createContractApp } from '../helpers/contract-harness.js';

// Mock db.js functions imported by routes/admin-overview.js
jest.unstable_mockModule('../../db.js', () => {
  const query = jest.fn(async (sql) => {
    // Minimal responses for the endpoints we test.
    if (String(sql).includes('quality_alerts')) return { rows: [] };
    if (String(sql).includes('failed_q')) return { rows: [{ pending_vapi: 0, overdue_vapi: 0, failed_q_24h: 0, legacy_daily_claim_rows_30d: 0 }] };
    if (String(sql).includes('COUNT(*) as count') && String(sql).includes('appointments')) {
      return { rows: [{ count: 0 }] };
    }
    return { rows: [] };
  });

  return {
    // used by admin-overview router
    query,
    listClientSummaries: jest.fn(async () => [{ clientKey: 'c1', displayName: 'Client 1', isEnabled: true }]),
    getLeadsByClient: jest.fn(async () => []),
    getCallsByTenant: jest.fn(async () => []),
    dbType: 'postgres'
  };
});

describe('Admin overview router contracts', () => {
  test('GET /api/admin/system-health returns expected shape', async () => {
    const { createAdminOverviewRouter } = await import('../../routes/admin-overview.js');
    const app = createContractApp({
      mounts: [{ path: '/api/admin', router: () => createAdminOverviewRouter({ broadcast: () => {} }) }]
    });

    const res = await request(app).get('/api/admin/system-health').expect(200);

    expect(res.body).toEqual(
      expect.objectContaining({
        status: expect.any(String),
        uptime: expect.any(Number),
        uptimeHuman: expect.any(String),
        errorCount: expect.any(Number),
        responseTime: expect.any(Number),
        recentErrors: expect.any(Array)
      })
    );
  });

  test('GET /api/admin/business-stats returns expected shape', async () => {
    const { createAdminOverviewRouter } = await import('../../routes/admin-overview.js');
    const app = createContractApp({
      mounts: [{ path: '/api/admin', router: () => createAdminOverviewRouter({ broadcast: () => {} }) }]
    });

    const res = await request(app).get('/api/admin/business-stats').expect(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        activeClients: expect.any(Number),
        monthlyRevenue: expect.any(Number),
        totalCalls: expect.any(Number),
        totalBookings: expect.any(Number),
        conversionRate: expect.anything()
      })
    );
  });
});

