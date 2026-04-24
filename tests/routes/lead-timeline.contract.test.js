import { describe, expect, test } from '@jest/globals';
import request from 'supertest';

import { createContractApp } from '../helpers/contract-harness.js';
import { createLeadTimelineRouter } from '../../routes/lead-timeline.js';

describe('routes/lead-timeline', () => {
  test('400 when clientKey missing', async () => {
    const router = createLeadTimelineRouter({ query: async () => ({ rows: [] }) });
    const app = createContractApp({ mounts: [{ path: '/api', router }] });
    await request(app).get('/api/leads/1/timeline').expect(400);
  });

  test('404 when lead not found', async () => {
    const query = async (sql) => {
      if (String(sql).includes('FROM leads')) return { rows: [] };
      return { rows: [] };
    };
    const router = createLeadTimelineRouter({ query });
    const app = createContractApp({ mounts: [{ path: '/api', router }] });
    await request(app).get('/api/leads/1/timeline?clientKey=c1').expect(404);
  });

  test('200 returns timeline array when lead found', async () => {
    const query = async (sql) => {
      const s = String(sql);
      if (s.includes('FROM leads')) return { rows: [{ id: 1, phone: '+447700900000', created_at: '2026-01-01T00:00:00.000Z', source: 'x' }] };
      if (s.includes('FROM calls')) return { rows: [{ status: 'ended', outcome: 'booked', created_at: '2026-01-01T00:01:00.000Z', duration: 12 }] };
      if (s.includes('FROM appointments')) return { rows: [] };
      if (s.includes('FROM messages')) return { rows: [] };
      return { rows: [] };
    };
    const router = createLeadTimelineRouter({ query });
    const app = createContractApp({ mounts: [{ path: '/api', router }] });
    const res = await request(app).get('/api/leads/1/timeline?clientKey=c1').expect(200);
    expect(res.body).toEqual(expect.objectContaining({ ok: true, timeline: expect.any(Array) }));
  });
});

