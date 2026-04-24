import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createImportLeadsRouter } from '../../routes/import-leads.js';

function buildImportRouter(overrides = {}) {
  const query = jest.fn(async (sql) => {
    const s = String(sql);
    if (s.includes('SELECT COUNT(*)')) return { rows: [{ n: 0 }] };
    if (s.includes('INSERT INTO leads')) {
      return {
        rows: [
          {
            id: 1,
            name: 'A',
            phone: '+447700900000',
            service: 'Lead Follow-Up',
            source: 'Import',
            status: 'new'
          }
        ]
      };
    }
    return { rows: [] };
  });

  const app = express();
  app.use(express.json());
  app.use(
    '/api',
    createImportLeadsRouter({
      getFullClient: jest.fn(async () => ({ clientKey: 'c1', isEnabled: true, vapi: { assistantId: 'asst', phoneNumberId: 'pn' } })),
      isBusinessHours: () => false,
      query,
      getClientFromHeader: jest.fn(),
      getNextBusinessHour: () => new Date('2030-06-01T10:00:00Z'),
      scheduleAtOptimalCallWindow: jest.fn(async () => new Date('2030-06-01T12:00:00Z')),
      addToCallQueue: jest.fn(async () => {}),
      validateAndSanitizePhone: (p) => p,
      phoneMatchKey: () => 'k',
      sanitizeInput: (s) => s,
      isOptedOut: async () => false,
      sendOperatorAlert: jest.fn(async () => {}),
      sanitizeLead: (row) => row,
      runOutboundCallsForImportedLeads: jest.fn(async () => ({ reason: 'queued_test', queued: 1 })),
      TIMEZONE: 'Europe/London',
      ...overrides
    })
  );
  return { app, query };
}

describe('routes/import-leads', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('POST /api/leads/import returns 400 when body invalid', async () => {
    const { app } = buildImportRouter();
    const res = await request(app).post('/api/leads/import').send({});
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  test('happy: POST /api/leads/import inserts and returns ok', async () => {
    const { app } = buildImportRouter();
    const res = await request(app)
      .post('/api/leads/import')
      .send({ clientKey: 'c1', leads: [{ phone: '+447700900000', name: 'A' }] });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.inserted).toBe(1);
    expect(res.body.callSummary).toEqual(expect.objectContaining({ reason: 'queued_test' }));
  });

  test('POST /api/leads/import__legacy uses same handler', async () => {
    const { app } = buildImportRouter();
    const res = await request(app)
      .post('/api/leads/import__legacy')
      .send({ clientKey: 'c1', leads: [{ phone: '+447700900000', name: 'A' }] });
    expect(res.status).toBe(200);
    expect(res.body.inserted).toBe(1);
  });
});
