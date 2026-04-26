import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';

beforeEach(() => {
  jest.resetModules();
});

describe('routes/admin-sales-pipeline', () => {
  test('covers scoring + followups + forecast(empty) + pipeline + pipeline updates', async () => {
    const query = jest.fn(async (sql, args) => {
      const s = String(sql);

      if (s.includes('FROM leads l') && s.includes("WHERE l.status != 'converted'")) {
        return {
          rows: [
            {
              id: 1,
              client_key: 'c1',
              created_at: new Date().toISOString(),
              email: 'x@y.co.uk',
              industry: 'Healthcare',
              call_count: 1,
              appointment_count: 0,
            }
          ]
        };
      }

      if (s.includes('FROM leads l') && s.includes("WHERE l.status IN ('new', 'contacted', 'follow_up')")) {
        return {
          rows: [
            {
              id: 2,
              client_key: 'c1',
              created_at: new Date().toISOString(),
              last_call_at: new Date(Date.now() - 5 * 86400 * 1000).toISOString(),
              last_outcome: 'callback_requested',
              call_count: 1,
            }
          ]
        };
      }

      if (s.includes('FROM appointments') && s.includes('GROUP BY DATE(created_at)')) {
        // forecast "no data" path
        return { rows: [] };
      }

      if (s.includes('FROM leads l') && s.includes('WHERE 1=1')) {
        return {
          rows: [
            {
              id: 3,
              client_key: args?.[0] || 'c1',
              created_at: new Date().toISOString(),
              status: 'new',
              call_count: 0,
              last_outcome: null,
              appointment_status: null,
            },
            {
              id: 4,
              client_key: args?.[0] || 'c1',
              created_at: new Date().toISOString(),
              status: 'converted',
              call_count: 2,
              last_outcome: 'interested',
              appointment_status: 'confirmed',
            }
          ]
        };
      }

      if (s.includes('UPDATE leads') && s.includes('WHERE id IN')) {
        return { rows: [{ id: 1 }, { id: 2 }] };
      }

      if (s.includes('UPDATE leads') && s.includes('WHERE id = $3')) {
        return { rows: [] };
      }

      if (s.includes('FROM leads l') && s.includes('WHERE l.id = $1')) {
        return { rows: [{ id: args?.[0] || 1, client_key: 'c1', client_name: 'C1' }] };
      }

      if (s.includes('FROM leads') && s.includes('GROUP BY DATE(created_at), status')) {
        return { rows: [{ date: '2026-01-01', status: 'new', count: '2' }, { date: '2026-01-01', status: 'converted', count: '1' }] };
      }

      return { rows: [] };
    });

    jest.unstable_mockModule('../../db.js', () => ({ query }));

    const { createAdminSalesPipelineRouter } = await import('../../routes/admin-sales-pipeline.js');
    const io = { to: () => ({ emit: jest.fn(() => {}) }) };
    const router = createAdminSalesPipelineRouter({ io });

    const app = express();
    app.use(express.json());
    app.use('/api/admin', router);

    const scoring = await request(app).get('/api/admin/leads/scoring').expect(200);
    expect(Array.isArray(scoring.body)).toBe(true);

    const followups = await request(app).get('/api/admin/followups/recommendations').expect(200);
    expect(Array.isArray(followups.body)).toBe(true);

    const forecastEmpty = await request(app).get('/api/admin/analytics/forecast?days=3').expect(200);
    expect(forecastEmpty.body).toEqual(expect.objectContaining({ forecast: [], period: 3 }));

    const pipeline = await request(app).get('/api/admin/pipeline?clientKey=c1').expect(200);
    expect(pipeline.body).toEqual(expect.objectContaining({ stages: expect.any(Array), totalLeads: 2 }));

    await request(app).put('/api/admin/pipeline/lead/123').send({ stage: 'contacted', notes: 'n' }).expect(200);

    await request(app).post('/api/admin/pipeline/bulk-move').send({ leadIds: [], targetStage: 'new' }).expect(400);
    const bulk = await request(app).post('/api/admin/pipeline/bulk-move').send({ leadIds: [1, 2], targetStage: 'qualified' }).expect(200);
    expect(bulk.body).toEqual(expect.objectContaining({ success: true, moved: 2 }));

    const analytics = await request(app).get('/api/admin/pipeline/analytics?days=7').expect(200);
    expect(analytics.body).toEqual(expect.objectContaining({ funnel: expect.any(Object), conversionRates: expect.any(Array) }));
  });
});

