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
      return { rows: [] };
    });
    const upsertImportedLead = jest.fn(async () => ({
      row: { id: 1, name: 'A', phone: '+447700900000', service: 'Lead Follow-Up', source: 'Import', status: 'new' },
      created: true,
    }));

    await handleLeadsImport(req, res, {
      query,
      upsertImportedLead,
      validateAndSanitizePhone: (p) => p,
      phoneMatchKey: () => 'k',
      sanitizeInput: (s) => s,
      isOptedOut: async () => false,
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({ ok: true, inserted: 1 }));
  });

  test('persists sanitized extra import fields into lead dial context', async () => {
    const req = {
      method: 'POST',
      url: '/api/leads/import',
      headers: {},
      body: {
        clientKey: 'c1',
        leads: [{ phone: '+447700900000', name: 'A', crmCampaign: 'spring-25', phoneType: 'mobile', leadName: 'blocked' }],
      }
    };
    const res = mockRes();
    const query = jest.fn(async (sql) => {
      if (String(sql).includes('SELECT COUNT(*)')) return { rows: [{ n: 0 }] };
      return { rows: [] };
    });
    const upsertImportedLead = jest.fn(async () => ({
      row: { id: 9, name: 'A', phone: '+447700900000', service: 'Lead Follow-Up', source: 'Import', status: 'new' },
      created: true,
    }));

    await handleLeadsImport(req, res, {
      query,
      upsertImportedLead,
      validateAndSanitizePhone: (p) => p,
      phoneMatchKey: () => 'k',
      sanitizeInput: (s) => s,
      isOptedOut: async () => false
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.inserted).toBe(1);
    expect(upsertImportedLead).toHaveBeenCalledWith(
      expect.objectContaining({
        clientKey: 'c1',
        leadDialContext: { crmCampaign: 'spring-25' },
      })
    );
  });

  test('persists explicit lead message overrides from customFields as an envelope', async () => {
    const req = {
      method: 'POST',
      url: '/api/leads/import',
      headers: {},
      body: {
        clientKey: 'c1',
        leads: [{
          phone: '+447700900000',
          name: 'A',
          customFields: {
            crmCampaign: 'spring-25',
            firstMessage: 'Hello there',
            systemMessage: 'Use the logistics script'
          }
        }],
      }
    };
    const res = mockRes();
    const query = jest.fn(async (sql) => {
      if (String(sql).includes('SELECT COUNT(*)')) return { rows: [{ n: 0 }] };
      return { rows: [] };
    });
    const upsertImportedLead = jest.fn(async () => ({
      row: { id: 10, name: 'A', phone: '+447700900000', service: 'Lead Follow-Up', source: 'Import', status: 'new' },
      created: true,
    }));

    await handleLeadsImport(req, res, {
      query,
      upsertImportedLead,
      validateAndSanitizePhone: (p) => p,
      phoneMatchKey: () => 'k',
      sanitizeInput: (s) => s,
      isOptedOut: async () => false
    });

    expect(res.statusCode).toBe(200);
    expect(upsertImportedLead).toHaveBeenCalledWith(
      expect.objectContaining({
        clientKey: 'c1',
        leadDialContext: {
          variableValues: { crmCampaign: 'spring-25' },
          firstMessage: 'Hello there',
          systemMessage: 'Use the logistics script'
        },
      })
    );
  });
});

