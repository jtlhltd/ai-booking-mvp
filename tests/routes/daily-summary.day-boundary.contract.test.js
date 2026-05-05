import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import request from 'supertest';

import { createContractApp } from '../helpers/contract-harness.js';
import { requireTenantAccessOrAdmin } from '../../middleware/security.js';
import { createDashboardRouteAuthStubs } from '../helpers/dashboard-route-auth-stubs.js';

const { authenticateApiKey: stubDashboardApiKey } = createDashboardRouteAuthStubs();

describe('routes/daily-summary.js day-boundary (tenant timezone)', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('counts “today” rows using tenant local midnight boundaries', async () => {
    // 2026-04-29T04:30:00Z = 2026-04-29 00:30 in America/New_York (EDT UTC-4)
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-29T04:30:00.000Z'));

    const tenantTz = 'America/New_York';

    const { createDailySummaryRouter } = await import('../../routes/daily-summary.js');
    const router = createDailySummaryRouter({
      getFullClient: jest.fn(async () => ({ clientKey: 'c1' })),
      resolveLogisticsSpreadsheetId: jest.fn(() => 'sheet_1'),
      pickTimezone: jest.fn(() => tenantTz),
      isPostgres: true,
      poolQuerySelect: jest.fn(async () => ({ rows: [{ n: 0 }] })),
      query: jest.fn(async () => ({ rows: [{ pending_total: 0 }] })),
      sheets: {
        ensureLogisticsHeader: jest.fn(async () => {}),
        readSheet: jest.fn(async () => ({ rows: [] })),
        logisticsSheetRowsToRecords: jest.fn(() => [
          // Tenant-local "yesterday 23:30" => NOT today
          {
            Timestamp: '28/04/2026, 23:30:00',
            Status: 'To call',
            Disposition: '',
            'Last Outcome At': '',
            'Business Name': 'A Co',
            Phone: '+1',
            'Transcript Snippet': '',
            'Callback Window': '',
            'Decision Maker': '',
            Email: '',
            'Recording URI': '',
            'Call ID': 'call-1'
          },
          // Tenant-local “today 00:15” => today
          {
            Timestamp: '29/04/2026, 00:15:00',
            Status: 'To call',
            Disposition: '',
            'Last Outcome At': '',
            'Business Name': 'B Co',
            Phone: '+1',
            'Transcript Snippet': '',
            'Callback Window': '',
            'Decision Maker': '',
            Email: '',
            'Recording URI': '',
            'Call ID': 'call-2'
          }
        ])
      },
      authenticateApiKey: stubDashboardApiKey,
      requireTenantAccessOrAdmin
    });

    const app = createContractApp({ mounts: [{ path: '/', router }] });

    try {
      const res = await request(app).get('/daily-summary/c1').expect(200);
      expect(res.body).toEqual(
        expect.objectContaining({
          ok: true,
          configured: true,
          followUp: expect.objectContaining({
            total: 2,
            todo: 2,
            today: expect.objectContaining({
              total: 1,
              todo: 1
            })
          })
        })
      );
    } finally {
      jest.useRealTimers();
    }
  });
});

