import { describe, test, expect } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createAdminVapiPlumbingRouter } from '../../routes/admin-vapi-plumbing-mount.js';

describe('routes/admin-vapi-plumbing-mount', () => {
  test('401 without X-API-Key', async () => {
    const app = express();
    app.use(express.json());
    app.use(
      createAdminVapiPlumbingRouter({
        getApiKey: () => 'secret',
        TIMEZONE: 'Europe/London',
        isBusinessHoursForTenant: () => true,
      }),
    );

    const res = await request(app).get('/admin/vapi/test-connection');
    expect(res.status).toBe(401);
  });
});

