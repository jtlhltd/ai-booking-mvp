import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import request from 'supertest';

import { createContractApp, withEnv } from '../helpers/contract-harness.js';

beforeEach(() => {
  jest.resetModules();
  global.fetch = undefined;
});

describe('routes/call-recordings.js contracts', () => {
  test('GET /call-recordings/:clientKey clamps limit and returns recordings', async () => {
    const query = jest.fn(async (sql, params) => {
      if (String(sql).includes('COUNT(*)')) return { rows: [{ n: 1 }] };
      // main query
      return {
        rows: [
          {
            id: 1,
            call_id: 'v1',
            lead_phone: '+441',
            recording_url: 'http://rec',
            duration: 0,
            outcome: 'completed',
            created_at: '2026-01-01T00:00:00.000Z',
            lead_id: 2,
            name: 'N'
          }
        ]
      };
    });
    const formatTimeAgoLabel = jest.fn(() => '1m');

    await withEnv({ VAPI_PRIVATE_KEY: 'k' }, async () => {
      global.fetch = jest.fn(async () => ({
        ok: true,
        json: async () => ({ status: 'ended', startedAt: '2026-01-01T00:00:00Z', endedAt: '2026-01-01T00:00:10Z' })
      }));

      const { createCallRecordingsRouter } = await import('../../routes/call-recordings.js');
      const router = createCallRecordingsRouter({ query, formatTimeAgoLabel });
      const app = createContractApp({ mounts: [{ path: '/', router }] });

      const res = await request(app).get('/call-recordings/c1?limit=500').expect(200);
      expect(res.body).toEqual(
        expect.objectContaining({
          ok: true,
          limit: 100,
          totalWithRecordings: 1,
          recordings: [
            expect.objectContaining({
              callId: 'v1',
              duration: 10,
              timeAgo: '1m'
            })
          ]
        })
      );

      // backfill update query should have been attempted
      expect(query).toHaveBeenCalledWith(
        expect.stringMatching(/UPDATE calls SET duration/i),
        expect.arrayContaining([10, 'c1', 'v1'])
      );
    });
  });
});

