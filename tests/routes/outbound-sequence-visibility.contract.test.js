import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import request from 'supertest';

import { createContractApp } from '../helpers/contract-harness.js';

beforeEach(() => {
  jest.resetModules();
});

describe('routes/outbound-sequence-visibility-mount.js', () => {
  test('GET /api/outbound-sequence/:clientKey/summary returns ok + no-store', async () => {
    const getFullClient = jest.fn(async () => ({ clientKey: 'd2d-xpress-tom', displayName: 'D2D Xpress' }));
    const query = jest.fn(async () => ({
      rows: [
        {
          active_sequences: '2',
          completed_today: '1',
          abandoned_today: '0',
          next_stage_queued: '3',
          oldest_active_updated_at: '2030-01-01T00:00:00.000Z',
        },
      ],
    }));

    const { createOutboundSequenceVisibilityRouter } = await import('../../routes/outbound-sequence-visibility-mount.js');
    const app = createContractApp({
      mounts: [
        {
          path: '/api',
          router: () =>
            createOutboundSequenceVisibilityRouter({
              query,
              getFullClient,
              isPostgres: true,
            }),
        },
      ],
    });

    const res = await request(app).get('/api/outbound-sequence/d2d-xpress-tom/summary').expect(200);
    expect(res.headers['cache-control']).toMatch(/no-store/i);
    expect(res.body).toEqual(
      expect.objectContaining({
        ok: true,
        clientKey: 'd2d-xpress-tom',
        summary: expect.objectContaining({
          activeSequences: 2,
          completedToday: 1,
          abandonedToday: 0,
          nextStageQueued: 3,
        }),
      })
    );
  });

  test('GET /api/outbound-sequence/:clientKey/phone/:phone returns ok true with row null when not found', async () => {
    const getFullClient = jest.fn(async () => ({ clientKey: 'd2d-xpress-tom' }));
    const query = jest.fn(async () => ({ rows: [] }));

    const { createOutboundSequenceVisibilityRouter } = await import('../../routes/outbound-sequence-visibility-mount.js');
    const app = createContractApp({
      mounts: [
        {
          path: '/api',
          router: () =>
            createOutboundSequenceVisibilityRouter({
              query,
              getFullClient,
              isPostgres: true,
            }),
        },
      ],
    });

    const res = await request(app).get('/api/outbound-sequence/d2d-xpress-tom/phone/%2B447700900000').expect(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        ok: true,
        clientKey: 'd2d-xpress-tom',
        row: null,
      })
    );
  });
});

