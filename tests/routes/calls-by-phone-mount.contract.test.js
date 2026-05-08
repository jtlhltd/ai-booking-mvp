import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import request from 'supertest';

import { createContractApp } from '../helpers/contract-harness.js';

beforeEach(() => {
  jest.resetModules();
});

describe('routes/calls-by-phone-mount.js', () => {
  test('GET /api/calls/:clientKey/phone/:phone returns ok + no-store + minimal call shape', async () => {
    const getFullClient = jest.fn(async () => ({ clientKey: 'd2d-xpress-tom' }));
    const query = jest.fn(async () => ({
      rows: [
        {
          call_id: 'call_123',
          client_key: 'd2d-xpress-tom',
          lead_phone: '+447700900000',
          status: 'completed',
          outcome: 'no-answer',
          duration: 12,
          cost: 0.11,
          retry_attempt: 2,
          transcript: 'hello transcript snippet',
          recording_url: 'https://rec.example/1',
          metadata: { stageId: 'stage_gatekeeper' },
          created_at: '2030-01-01T00:00:00.000Z',
          updated_at: '2030-01-01T00:01:00.000Z',
        },
      ],
    }));

    const { createCallsByPhoneRouter } = await import('../../routes/calls-by-phone-mount.js');
    const app = createContractApp({
      mounts: [
        {
          path: '/api',
          router: () => createCallsByPhoneRouter({ query, getFullClient }),
        },
      ],
    });

    const res = await request(app).get('/api/calls/d2d-xpress-tom/phone/%2B447700900000?limit=25').expect(200);
    expect(res.headers['cache-control']).toMatch(/no-store/i);
    expect(res.body).toEqual(
      expect.objectContaining({
        ok: true,
        clientKey: 'd2d-xpress-tom',
        phone: '+447700900000',
        limit: 25,
        calls: expect.any(Array),
      })
    );
    expect(res.body.calls[0]).toEqual(
      expect.objectContaining({
        callId: 'call_123',
        leadPhone: '+447700900000',
        status: 'completed',
        outcome: 'no-answer',
        duration: 12,
        recordingUrl: 'https://rec.example/1',
        transcriptSnippet: expect.any(String),
      })
    );
  });

  test('GET /api/calls/:clientKey/phone/:phone returns 404 when client not found', async () => {
    const getFullClient = jest.fn(async () => null);
    const query = jest.fn(async () => ({ rows: [] }));

    const { createCallsByPhoneRouter } = await import('../../routes/calls-by-phone-mount.js');
    const app = createContractApp({
      mounts: [{ path: '/api', router: () => createCallsByPhoneRouter({ query, getFullClient }) }],
    });

    const res = await request(app).get('/api/calls/nope/phone/%2B447700900000').expect(404);
    expect(res.body).toEqual(expect.objectContaining({ ok: false, error: 'client_not_found' }));
  });
});

