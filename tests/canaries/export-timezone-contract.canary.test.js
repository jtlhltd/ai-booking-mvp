import { describe, expect, test } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createCoreApiRouter } from '../../routes/core-api.js';

function parseCsvRows(csvText) {
  const lines = String(csvText || '')
    .split(/\r?\n/)
    .filter(Boolean);
  if (!lines.length) return { headers: [], rows: [] };
  const split = (line) => {
    const out = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      const nx = line[i + 1];
      if (ch === '"' && inQ && nx === '"') {
        cur += '"';
        i += 1;
      } else if (ch === '"') {
        inQ = !inQ;
      } else if (ch === ',' && !inQ) {
        out.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out;
  };
  const headers = split(lines[0]);
  const rows = lines.slice(1).map((l) => {
    const cells = split(l);
    const r = {};
    headers.forEach((h, idx) => { r[h] = cells[idx] ?? ''; });
    return r;
  });
  return { headers, rows };
}

describe('canary: scheduling.export-timezone-contract', () => {
  test('leads export includes explicit UTC/local/timezone columns', async () => {
    const app = express();
    app.use('/api', createCoreApiRouter({
      query: async (sql) => {
        if (String(sql).includes('FROM leads')) {
          return { rows: [{ name: 'A', phone: '+44123', service: 'S', source: 'X', status: 'new', notes: '', created_at: '2026-04-09T09:15:41.000Z' }] };
        }
        return { rows: [] };
      },
      getIntegrationStatuses: async () => [],
      getFullClient: async () => ({ booking: { timezone: 'Europe/London' }, timezone: 'UTC' })
    }));

    const res = await request(app).get('/api/export/leads?clientKey=test');
    expect(res.status).toBe(200);
    const { headers, rows } = parseCsvRows(res.text);
    expect(headers).toEqual(expect.arrayContaining(['Created UTC', 'Created Local', 'Tenant Timezone']));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]['Tenant Timezone']).toBe('Europe/London');
    expect(rows[0]['Created UTC']).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(rows[0]['Created Local']).toMatch(/^\d{4}-\d{2}-\d{2}\s/);
  });
});
