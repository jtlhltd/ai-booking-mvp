import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import request from 'supertest';

import { createContractApp } from '../helpers/contract-harness.js';

beforeEach(() => {
  jest.resetModules();
});

describe('routes/lead-handoff.js contracts', () => {
  test('GET /handoff/:clientKey returns rows list', async () => {
    const { createLeadHandoffRouter } = await import('../../routes/lead-handoff.js');
    const router = createLeadHandoffRouter({
      listLeadHandoff: jest.fn(async () => [{ clientKey: 'c1', leadPhone: '+447700900111' }]),
      getLeadHandoffByPhone: jest.fn(),
      setLeadHandoffOperatorNotes: jest.fn(),
      phoneMatchKey: (p) => String(p || '').trim(),
    });
    const app = createContractApp({ mounts: [{ path: '/', router }] });

    const res = await request(app).get('/handoff/c1?limit=2&offset=0').expect(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        ok: true,
        clientKey: 'c1',
        rows: expect.any(Array),
      })
    );
    expect(res.body.rows.length).toBe(1);
  });

  test('POST /handoff/:clientKey/batch returns items map', async () => {
    const { createLeadHandoffRouter } = await import('../../routes/lead-handoff.js');
    const getLeadHandoffByPhone = jest.fn(async ({ leadPhone }) => ({ leadPhone, summaryText: 'ok' }));
    const router = createLeadHandoffRouter({
      listLeadHandoff: jest.fn(),
      getLeadHandoffByPhone,
      setLeadHandoffOperatorNotes: jest.fn(),
      phoneMatchKey: (p) => `mk:${String(p || '').trim()}`,
    });
    const app = createContractApp({ mounts: [{ path: '/', router }] });

    const res = await request(app)
      .post('/handoff/c1/batch')
      .send({ phones: ['+447700900111', '+447700900111', '+447700900222'] })
      .expect(200);

    expect(res.body).toEqual(
      expect.objectContaining({
        ok: true,
        clientKey: 'c1',
        items: expect.any(Object),
      })
    );
    expect(Object.keys(res.body.items).length).toBeGreaterThan(0);
    expect(getLeadHandoffByPhone).toHaveBeenCalled();
  });

  test('POST /handoff/:clientKey/phone/:phone/notes updates notes', async () => {
    const { createLeadHandoffRouter } = await import('../../routes/lead-handoff.js');
    const setLeadHandoffOperatorNotes = jest.fn(async () => {});
    const router = createLeadHandoffRouter({
      listLeadHandoff: jest.fn(),
      getLeadHandoffByPhone: jest.fn(),
      setLeadHandoffOperatorNotes,
      phoneMatchKey: (p) => String(p || '').trim(),
    });
    const app = createContractApp({ mounts: [{ path: '/', router }] });

    const res = await request(app)
      .post('/handoff/c1/phone/%2B447700900111/notes')
      .send({ operatorNotes: 'Left voicemail, call back Friday' })
      .expect(200);

    expect(res.body).toEqual({ ok: true });
    expect(setLeadHandoffOperatorNotes).toHaveBeenCalledWith({
      clientKey: 'c1',
      leadPhone: '+447700900111',
      operatorNotes: 'Left voicemail, call back Friday',
    });
  });
});

