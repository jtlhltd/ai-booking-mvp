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

  test('GET /handoff/:clientKey applies abandoned cohort filter', async () => {
    const { createLeadHandoffRouter } = await import('../../routes/lead-handoff.js');
    const router = createLeadHandoffRouter({
      listLeadHandoff: jest.fn(async () => [
        { clientKey: 'c1', leadPhone: '+447700900111', source: 'vapi_webhook.sequence_abandoned', summaryText: 'abandoned' },
        { clientKey: 'c1', leadPhone: '+447700900222', source: 'vapi_webhook.sequence_completed', summaryText: 'done' }
      ]),
      getLeadHandoffByPhone: jest.fn(),
      setLeadHandoffOperatorNotes: jest.fn(),
      phoneMatchKey: (p) => String(p || '').replace(/\D+/g, '').slice(-10) || null,
      getFullClient: jest.fn(async () => ({
        clientKey: 'c1',
        timezone: 'Europe/London',
        outboundSequence: { enabled: false, classicFollowUpCutoverDate: '2026-05-10' }
      })),
      query: jest.fn(async (sql) => {
        const text = String(sql);
        if (text.includes('FROM lead_handoff')) {
          return {
            rows: [
              { leadPhone: '+447700900111', phoneMatchKey: '7700900111', source: 'vapi_webhook.sequence_abandoned' },
              { leadPhone: '+447700900222', phoneMatchKey: '7700900222', source: 'vapi_webhook.sequence_completed' }
            ]
          };
        }
        if (text.includes('FROM leads')) {
          return {
            rows: [
              { phone: '+447700900111', phoneMatchKey: '7700900111', createdAt: '2026-05-12T09:00:00.000Z' },
              { phone: '+447700900222', phoneMatchKey: '7700900222', createdAt: '2026-05-12T09:00:00.000Z' }
            ]
          };
        }
        if (text.includes('FROM lead_sequence_state')) {
          return {
            rows: [
              { leadPhone: '+447700900111', status: 'abandoned', updatedAt: '2026-05-12T11:00:00.000Z' },
              { leadPhone: '+447700900222', status: 'completed', updatedAt: '2026-05-12T11:00:00.000Z' }
            ]
          };
        }
        return { rows: [] };
      })
    });
    const app = createContractApp({ mounts: [{ path: '/', router }] });

    const res = await request(app).get('/handoff/c1?filter=abandoned').expect(200);
    expect(res.body).toEqual(expect.objectContaining({
      ok: true,
      clientKey: 'c1',
      filter: 'abandoned',
      total: 1,
      rows: expect.any(Array)
    }));
    expect(res.body.rows).toHaveLength(1);
    expect(res.body.rows[0]).toEqual(expect.objectContaining({
      leadPhone: '+447700900111',
      dashboardCohort: 'abandoned'
    }));
  });

  test('GET /handoff/:clientKey applies stopped cohort filter', async () => {
    const { createLeadHandoffRouter } = await import('../../routes/lead-handoff.js');
    const router = createLeadHandoffRouter({
      listLeadHandoff: jest.fn(async () => [
        { clientKey: 'c1', leadPhone: '+447700900111', source: 'operator.sequence_stopped', summaryText: 'stopped' },
        { clientKey: 'c1', leadPhone: '+447700900222', source: 'vapi_webhook.sequence_abandoned', summaryText: 'abandoned' }
      ]),
      getLeadHandoffByPhone: jest.fn(),
      setLeadHandoffOperatorNotes: jest.fn(),
      phoneMatchKey: (p) => String(p || '').replace(/\D+/g, '').slice(-10) || null,
      getFullClient: jest.fn(async () => ({
        clientKey: 'c1',
        timezone: 'Europe/London',
        outboundSequence: { enabled: false, classicFollowUpCutoverDate: '2026-05-10' }
      })),
      query: jest.fn(async (sql) => {
        const text = String(sql);
        if (text.includes('FROM lead_handoff')) {
          return {
            rows: [
              { leadPhone: '+447700900111', phoneMatchKey: '7700900111', source: 'operator.sequence_stopped' },
              { leadPhone: '+447700900222', phoneMatchKey: '7700900222', source: 'vapi_webhook.sequence_abandoned' }
            ]
          };
        }
        if (text.includes('FROM leads')) {
          return {
            rows: [
              { phone: '+447700900111', phoneMatchKey: '7700900111', createdAt: '2026-05-12T09:00:00.000Z' },
              { phone: '+447700900222', phoneMatchKey: '7700900222', createdAt: '2026-05-12T09:00:00.000Z' }
            ]
          };
        }
        if (text.includes('FROM lead_sequence_state')) {
          return {
            rows: [
              { leadPhone: '+447700900111', status: 'abandoned', updatedAt: '2026-05-12T11:00:00.000Z' },
              { leadPhone: '+447700900222', status: 'abandoned', updatedAt: '2026-05-12T11:00:00.000Z' }
            ]
          };
        }
        return { rows: [] };
      })
    });
    const app = createContractApp({ mounts: [{ path: '/', router }] });

    const res = await request(app).get('/handoff/c1?filter=stopped').expect(200);
    expect(res.body).toEqual(expect.objectContaining({
      ok: true,
      clientKey: 'c1',
      filter: 'stopped',
      total: 1,
      rows: expect.any(Array)
    }));
    expect(res.body.rows).toHaveLength(1);
    expect(res.body.rows[0]).toEqual(expect.objectContaining({
      leadPhone: '+447700900111',
      dashboardCohort: 'stopped'
    }));
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

  test('GET /handoff/:clientKey/export.csv returns CSV', async () => {
    const { createLeadHandoffRouter } = await import('../../routes/lead-handoff.js');
    const router = createLeadHandoffRouter({
      listLeadHandoff: jest.fn(async () => [
        {
          updatedAt: '2026-01-01T00:00:00.000Z',
          leadPhone: '+447700900111',
          decisionMaker: 'Alex',
          callbackWindow: 'Thu PM',
          summaryText: 'ok',
          dataJson: JSON.stringify({ lane: 'UK->FR' }),
        },
      ]),
      getLeadHandoffByPhone: jest.fn(),
      setLeadHandoffOperatorNotes: jest.fn(),
      phoneMatchKey: (p) => String(p || '').trim(),
    });
    const app = createContractApp({ mounts: [{ path: '/', router }] });

    const res = await request(app).get('/handoff/c1/export.csv?limit=10').expect(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(String(res.text || '')).toContain('leadPhone');
    expect(String(res.text || '')).toContain('+447700900111');
  });
});

