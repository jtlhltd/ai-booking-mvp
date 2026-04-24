import { describe, test, expect, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createAdminVapiLogisticsRouter } from '../../routes/admin-vapi-logistics-mount.js';

describe('routes/admin-vapi-logistics-mount', () => {
  test('401 without X-API-Key', async () => {
    const app = express();
    app.use(express.json());
    app.use(
      createAdminVapiLogisticsRouter({
        getApiKey: () => 'secret',
        runLogisticsOutreach: async () => [],
      }),
    );

    const res = await request(app).post('/admin/vapi/logistics-outreach').send({ assistantId: 'a', businesses: [] });
    expect(res.status).toBe(401);
  });

  test('happy: logistics-outreach returns 200 with correct key', async () => {
    const runLogisticsOutreach = jest.fn(async () => [{ ok: true }]);
    const app = express();
    app.use(express.json());
    app.use(
      createAdminVapiLogisticsRouter({
        getApiKey: () => 'secret',
        runLogisticsOutreach,
      }),
    );

    const res = await request(app)
      .post('/admin/vapi/logistics-csv-import')
      .set('X-API-Key', 'secret')
      .send({
        assistantId: 'a',
        csvData: [{ 'Business Name': 'Biz', Phone: '+15551234567', Address: 'Somewhere' }]
      })
      .expect(200);

    expect(res.body).toEqual(expect.objectContaining({ success: true, totalBusinesses: 1 }));
    expect(runLogisticsOutreach).toHaveBeenCalled();
  });
});

