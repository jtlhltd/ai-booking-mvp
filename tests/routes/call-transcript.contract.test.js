import { describe, expect, test } from '@jest/globals';
import request from 'supertest';

import { createContractApp } from '../helpers/contract-harness.js';
import { createCallTranscriptRouter } from '../../routes/call-transcript.js';

describe('routes/call-transcript', () => {
  test('400 when clientKey missing', async () => {
    const router = createCallTranscriptRouter({ query: async () => ({ rows: [] }) });
    const app = createContractApp({ mounts: [{ path: '/api', router }] });
    await request(app).get('/api/calls/call1/transcript').expect(400);
  });

  test('404 when call not found', async () => {
    const query = async () => ({ rows: [] });
    const router = createCallTranscriptRouter({ query });
    const app = createContractApp({ mounts: [{ path: '/api', router }] });
    await request(app).get('/api/calls/call1/transcript?clientKey=c1').expect(404);
  });

  test('200 returns transcript when found by call_id', async () => {
    const query = async (sql) => {
      if (String(sql).includes('FROM calls')) {
        return {
          rows: [
            {
              transcript: 'hello',
              summary: null,
              duration: 12,
              created_at: '2026-01-01T00:00:00.000Z',
              call_id: 'uuid-123',
              id: 1,
              lead_phone: '+1',
              metadata: { endedReason: 'customer-hung-up' }
            }
          ]
        };
      }
      return { rows: [] };
    };
    const router = createCallTranscriptRouter({ query });
    const app = createContractApp({ mounts: [{ path: '/api', router }] });
    const res = await request(app).get('/api/calls/uuid-123/transcript?clientKey=c1').expect(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        ok: true,
        transcript: 'hello',
        callEndedBy: 'user'
      })
    );
  });
});

