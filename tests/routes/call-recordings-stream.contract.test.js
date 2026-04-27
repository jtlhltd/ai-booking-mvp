import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import request from 'supertest';

import { createContractApp, withEnv } from '../helpers/contract-harness.js';

beforeEach(() => {
  jest.resetModules();
  global.fetch = undefined;
});

describe('routes/call-recordings-stream.js contracts', () => {
  test('GET /call-recordings/:clientKey/stream/:callRowId forwards Range and adds Vapi auth for vapi hosts', async () => {
    const poolQuerySelect = jest.fn(async () => ({ rows: [{ recording_url: 'https://api.vapi.ai/recordings/test123.mp3' }] }));
    const fetchMock = jest.fn(async (_url, init) => {
      expect(init?.headers?.Range).toBe('bytes=0-1');
      expect(init?.headers?.Authorization).toBe('Bearer k');
      return {
        ok: true,
        status: 206,
        headers: {
          get: (k) => {
            const key = String(k || '').toLowerCase();
            if (key === 'content-type') return 'audio/mpeg';
            if (key === 'content-range') return 'bytes 0-1/2';
            if (key === 'accept-ranges') return 'bytes';
            if (key === 'content-length') return '2';
            return null;
          }
        },
        body: null,
        arrayBuffer: async () => new Uint8Array([1, 2]).buffer
      };
    });

    await withEnv({ VAPI_PRIVATE_KEY: 'k' }, async () => {
      global.fetch = fetchMock;
      const { createCallRecordingsStreamRouter } = await import('../../routes/call-recordings-stream.js');
      const app = createContractApp({ mounts: [{ path: '/', router: () => createCallRecordingsStreamRouter({ poolQuerySelect }) }] });

      const res = await request(app)
        .get('/call-recordings/c1/stream/123')
        .set('Range', 'bytes=0-1')
        .expect(206);

      expect(res.headers['content-type']).toMatch(/audio/);
      expect(poolQuerySelect).toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalled();
      expect(res.body).toBeInstanceOf(Buffer);
      expect(res.body.length).toBe(2);
    });
  });

  test('adds Vapi auth for storage.vapi.ai and S3 recording hosts', async () => {
    const poolQuerySelect = jest.fn(async () => ({
      rows: [{ recording_url: 'https://storage.vapi.ai/call-recordings/test123.mp3' }]
    }));
    const fetchMock = jest.fn(async (_url, init) => {
      expect(init?.headers?.Authorization).toBe('Bearer k');
      return {
        ok: true,
        status: 200,
        headers: { get: (k) => (String(k || '').toLowerCase() === 'content-type' ? 'audio/mpeg' : null) },
        body: null,
        arrayBuffer: async () => new Uint8Array([1]).buffer
      };
    });

    await withEnv({ VAPI_PRIVATE_KEY: 'k' }, async () => {
      global.fetch = fetchMock;
      const { createCallRecordingsStreamRouter } = await import('../../routes/call-recordings-stream.js');
      const app = createContractApp({ mounts: [{ path: '/', router: () => createCallRecordingsStreamRouter({ poolQuerySelect }) }] });
      await request(app).get('/call-recordings/c1/stream/123').expect(200);
    });

    // S3 host
    const poolQuerySelect2 = jest.fn(async () => ({
      rows: [{ recording_url: 'https://vapi-call-recordings.s3.us-west-2.amazonaws.com/test123.mp3' }]
    }));
    await withEnv({ VAPI_PRIVATE_KEY: 'k' }, async () => {
      global.fetch = fetchMock;
      const { createCallRecordingsStreamRouter } = await import('../../routes/call-recordings-stream.js');
      const app = createContractApp({ mounts: [{ path: '/', router: () => createCallRecordingsStreamRouter({ poolQuerySelect: poolQuerySelect2 }) }] });
      await request(app).get('/call-recordings/c1/stream/123').expect(200);
    });
  });

  test('GET /call-recordings/:clientKey/stream/:callRowId returns 502 upstream_fetch_failed on network failure', async () => {
    const poolQuerySelect = jest.fn(async () => ({ rows: [{ recording_url: 'https://api.vapi.ai/recordings/test123.mp3' }] }));
    await withEnv({ VAPI_PRIVATE_KEY: 'k' }, async () => {
      global.fetch = jest.fn(async () => {
        throw new TypeError('fetch failed');
      });
      const { createCallRecordingsStreamRouter } = await import('../../routes/call-recordings-stream.js');
      const app = createContractApp({ mounts: [{ path: '/', router: () => createCallRecordingsStreamRouter({ poolQuerySelect }) }] });
      const res = await request(app).get('/call-recordings/c1/stream/123').expect(502);
      expect(res.body).toEqual(expect.objectContaining({ ok: false, error: 'upstream_fetch_failed' }));
    });
  });
});

