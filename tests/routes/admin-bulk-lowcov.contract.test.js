import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import request from 'supertest';

import { createContractApp } from '../helpers/contract-harness.js';

beforeEach(() => {
  jest.resetModules();
});

describe('admin bulk low-coverage contract sweeps', () => {
  test('admin-appointments: GET /api/admin/appointments/analytics returns metrics payload', async () => {
    const query = jest.fn(async (sql) => {
      const s = String(sql);
      if (s.includes('calculate_appointment_metrics')) return { rows: [{ metrics: { ok: true } }] };
      if (s.includes('get_appointment_insights')) return { rows: [{ insights: { hi: 1 } }] };
      return { rows: [] };
    });
    const { createAdminAppointmentsRouter } = await import('../../routes/admin-appointments.js');
    const router = createAdminAppointmentsRouter({ query });
    const app = createContractApp({ mounts: [{ path: '/api/admin', router }] });

    const res = await request(app).get('/api/admin/appointments/analytics?clientKey=c1&daysBack=1').expect(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        metrics: expect.any(Object),
        insights: expect.any(Object),
        funnel: expect.any(Array),
        hourlyDistribution: expect.any(Array),
        dailyDistribution: expect.any(Array)
      })
    );
  });

  test('admin-follow-ups: POST /api/admin/follow-ups/sequences returns 400 when name missing', async () => {
    const { createAdminFollowUpsRouter } = await import('../../routes/admin-follow-ups.js');
    const router = createAdminFollowUpsRouter({ query: async () => ({ rows: [] }) });
    const app = createContractApp({ mounts: [{ path: '/api/admin', router }] });
    await request(app).post('/api/admin/follow-ups/sequences').send({ triggerType: 'x' }).expect(400);
  });

  test('admin-documents-comments-fields: GET /api/admin/documents returns [] on db error', async () => {
    jest.unstable_mockModule('../../db.js', () => ({
      query: jest.fn(async () => {
        throw new Error('boom');
      })
    }));
    const { createAdminDocumentsCommentsFieldsRouter } = await import('../../routes/admin-documents-comments-fields.js');
    const router = createAdminDocumentsCommentsFieldsRouter();
    const app = createContractApp({ mounts: [{ path: '/api/admin', router }] });

    const res = await request(app).get('/api/admin/documents').expect(200);
    expect(res.body).toEqual([]);
  });

  test('admin-reports: GET /api/admin/reports maps rows to API shape', async () => {
    const query = jest.fn(async () => ({
      rows: [
        {
          id: 1,
          name: 'r',
          description: 'd',
          report_type: 't',
          category: 'c',
          config: {},
          filters: {},
          chart_config: {},
          is_public: false,
          is_scheduled: false,
          schedule_config: null,
          client_key: 'c1',
          created_by: 'u',
          execution_count: '2',
          successful_executions: '1',
          last_run_at: null,
          last_execution: null,
          created_at: 'now',
          updated_at: 'now'
        }
      ]
    }));
    const { createAdminReportsRouter } = await import('../../routes/admin-reports.js');
    const router = createAdminReportsRouter({ query });
    const app = createContractApp({ mounts: [{ path: '/api/admin', router }] });

    const res = await request(app).get('/api/admin/reports?clientKey=c1').expect(200);
    expect(res.body[0]).toEqual(expect.objectContaining({ executionCount: 2, successfulExecutions: 1, reportType: 't' }));
  });

  test('admin-social: POST /api/admin/social/profiles returns 500 on insert error', async () => {
    const query = jest.fn(async () => {
      throw new Error('insert failed');
    });
    const { createAdminSocialRouter } = await import('../../routes/admin-social.js');
    const router = createAdminSocialRouter({ query });
    const app = createContractApp({ mounts: [{ path: '/api/admin', router }] });

    await request(app)
      .post('/api/admin/social/profiles')
      .send({ platform: 'x', handle: 'h', url: 'u', clientKey: 'c1' })
      .expect(500);
  });
});

