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

  test('POST /follow-up-queue/:clientKey/batchPatch returns per-row ok results', async () => {
    const { createFollowUpQueueRouter } = await import('../../routes/follow-up-queue.js');
    const patchLogisticsRowByNumber = jest.fn(async () => true);
    const router = createFollowUpQueueRouter({
      getFullClient: jest.fn(async () => ({ clientKey: 'c1' })),
      resolveLogisticsSpreadsheetId: jest.fn(() => 'sheet_1'),
      sheets: {
        patchLogisticsRowByNumber
      }
    });
    const app = createContractApp({ mounts: [{ path: '/', router }] });

    const res = await request(app)
      .post('/follow-up-queue/c1/batchPatch')
      .send({
        patches: [
          { row: 2, patch: { Status: 'Called' } },
          { row: 1, patch: { Status: 'Called' } }, // invalid_row (< 2)
          { row: 3, patch: null } // invalid_patch (null)
        ]
      })
      .expect(200);

    expect(res.body).toEqual(
      expect.objectContaining({
        ok: true,
        updated: 1,
        total: 3,
        results: expect.any(Array)
      })
    );

    expect(res.body.results[0]).toEqual({ ok: true, row: 2 });
    expect(res.body.results[1]).toEqual({ ok: false, row: 1, error: 'invalid_item' });
    expect(res.body.results[2]).toEqual({ ok: false, row: 3, error: 'invalid_item' });

    expect(patchLogisticsRowByNumber).toHaveBeenCalledTimes(1);
    expect(patchLogisticsRowByNumber).toHaveBeenCalledWith('sheet_1', 2, { Status: 'Called' });
  });
});

