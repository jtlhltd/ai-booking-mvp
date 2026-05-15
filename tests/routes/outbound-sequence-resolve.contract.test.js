import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import request from 'supertest';

import { createContractApp } from '../helpers/contract-harness.js';

beforeEach(() => {
  jest.resetModules();
});

describe('GET /api/outbound-sequence/:clientKey/resolve', () => {
  test('returns matches by lead name', async () => {
    const getFullClient = jest.fn(async () => ({
      clientKey: 'd2d-xpress-tom',
      outboundSequence: { enabled: true, stages: [] },
    }));
    const query = jest.fn(async (sql) => {
      const s = String(sql);
      if (s.includes('FROM lead_sequence_state') && s.includes('DISTINCT lead_phone')) {
        return { rows: [] };
      }
      if (s.includes('l.name ILIKE')) {
        return {
          rows: [{ leadPhone: '+447700900111', name: 'Acme Logistics', service: 'courier' }],
        };
      }
      if (s.includes('FROM lead_handoff')) return { rows: [] };
      return { rows: [] };
    });

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

    const res = await request(app)
      .get('/api/outbound-sequence/d2d-xpress-tom/resolve')
      .query({ q: 'acme' })
      .expect(200);

    expect(res.body).toEqual(
      expect.objectContaining({
        ok: true,
        query: 'acme',
        matches: [
          expect.objectContaining({
            leadPhone: '+447700900111',
            matchType: 'text',
            label: expect.stringContaining('Acme'),
          }),
        ],
      })
    );
  });

  test('rejects queries shorter than 2 characters', async () => {
    const getFullClient = jest.fn(async () => ({ clientKey: 'd2d-xpress-tom', outboundSequence: { enabled: true, stages: [] } }));
    const query = jest.fn(async () => ({ rows: [] }));
    const { createOutboundSequenceVisibilityRouter } = await import('../../routes/outbound-sequence-visibility-mount.js');
    const app = createContractApp({
      mounts: [
        {
          path: '/api',
          router: () => createOutboundSequenceVisibilityRouter({ query, getFullClient, isPostgres: true }),
        },
      ],
    });

    const res = await request(app)
      .get('/api/outbound-sequence/d2d-xpress-tom/resolve')
      .query({ q: 'a' })
      .expect(400);
    expect(res.body.error).toBe('query_too_short');
  });
});
