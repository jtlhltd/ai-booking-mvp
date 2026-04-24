import { describe, test, expect, jest } from '@jest/globals';
import { handleLeadsImport } from '../../lib/leads-import.js';

function mockRes() {
  const res = {};
  res.statusCode = 200;
  res.body = null;
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  return res;
}

describe('lib/leads-import', () => {
  test('400 when clientKey or leads missing', async () => {
    const req = { method: 'POST', url: '/api/leads/import', headers: {}, body: {} };
    const res = mockRes();

    await handleLeadsImport(req, res, { query: jest.fn() });

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual(expect.objectContaining({ ok: false }));
  });

  test('happy: inserts one lead and returns ok true', async () => {
    const req = {
      method: 'POST',
      url: '/api/leads/import',
      headers: { 'content-type': 'application/json' },
      body: { clientKey: 'c1', leads: [{ phone: '+447700900000', name: 'A' }] }
    };
    const res = mockRes();

    const query = jest.fn(async (sql) => {
      const s = String(sql);
      if (s.includes('SELECT COUNT(*)')) return { rows: [{ n: 0 }] };
      if (s.includes('INSERT INTO leads')) {
        return { rows: [{ id: 1, name: 'A', phone: '+447700900000', service: 'Lead Follow-Up', source: 'Import', status: 'new' }] };
      }
      return { rows: [] };
    });

    await handleLeadsImport(req, res, {
      query,
      validateAndSanitizePhone: (p) => p,
      phoneMatchKey: () => 'k',
      sanitizeInput: (s) => s,
      isOptedOut: async () => false,
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({ ok: true, inserted: 1 }));
  });
});

