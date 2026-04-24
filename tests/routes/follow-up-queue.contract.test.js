import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import request from 'supertest';

import { createContractApp } from '../helpers/contract-harness.js';

beforeEach(() => {
  jest.resetModules();
});

describe('routes/follow-up-queue.js contracts', () => {
  test('GET /follow-up-queue/:clientKey returns demo rows for demo client', async () => {
    const { createFollowUpQueueRouter } = await import('../../routes/follow-up-queue.js');
    const router = createFollowUpQueueRouter({
      getFullClient: jest.fn(),
      resolveLogisticsSpreadsheetId: jest.fn(),
      sheets: {}
    });
    const app = createContractApp({ mounts: [{ path: '/', router }] });

    const res = await request(app).get('/follow-up-queue/demo-client?limit=1&offset=0').expect(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        ok: true,
        demo: true,
        configured: true,
        source: 'demo',
        total: expect.any(Number),
        rows: expect.any(Array)
      })
    );
    expect(res.body.rows.length).toBe(1);
  });

  test('GET /follow-up-queue/:clientKey returns configured=false when no sheet linked', async () => {
    const { createFollowUpQueueRouter } = await import('../../routes/follow-up-queue.js');
    const router = createFollowUpQueueRouter({
      getFullClient: jest.fn(async () => ({ clientKey: 'c1' })),
      resolveLogisticsSpreadsheetId: jest.fn(() => ''),
      sheets: {}
    });
    const app = createContractApp({ mounts: [{ path: '/', router }] });

    const res = await request(app).get('/follow-up-queue/c1').expect(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        ok: true,
        configured: false,
        total: 0,
        rows: []
      })
    );
  });

  test('GET /follow-up-queue/:clientKey returns 502 when sheet read fails', async () => {
    const { createFollowUpQueueRouter } = await import('../../routes/follow-up-queue.js');
    const router = createFollowUpQueueRouter({
      getFullClient: jest.fn(async () => ({ clientKey: 'c1' })),
      resolveLogisticsSpreadsheetId: jest.fn(() => 'sheet_1'),
      sheets: {
        ensureLogisticsHeader: jest.fn(async () => {}),
        readSheet: jest.fn(async () => {
          throw new Error('sheet_down');
        }),
        logisticsSheetRowsToRecords: jest.fn(() => [])
      }
    });
    const app = createContractApp({ mounts: [{ path: '/', router }] });

    const res = await request(app).get('/follow-up-queue/c1').expect(502);
    expect(res.body).toEqual(
      expect.objectContaining({
        ok: false,
        error: 'sheet_read_failed'
      })
    );
  });

  test('GET /follow-up-queue/:clientKey/stats returns demo stats breakdown', async () => {
    const { createFollowUpQueueRouter } = await import('../../routes/follow-up-queue.js');
    const router = createFollowUpQueueRouter({
      getFullClient: jest.fn(),
      resolveLogisticsSpreadsheetId: jest.fn(),
      sheets: {}
    });
    const app = createContractApp({ mounts: [{ path: '/', router }] });

    const res = await request(app).get('/follow-up-queue/demo_client/stats').expect(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        ok: true,
        demo: true,
        configured: true,
        stats: expect.objectContaining({
          total: expect.any(Number),
          todo: expect.any(Number),
          called: expect.any(Number),
          dnc: expect.any(Number),
          disqualified: expect.any(Number),
          today: expect.any(Object)
        })
      })
    );
  });
});

