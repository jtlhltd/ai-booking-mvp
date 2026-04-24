import { describe, test, expect } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createAdminVapiCampaignsRouter } from '../../routes/admin-vapi-campaigns-mount.js';

describe('routes/admin-vapi-campaigns-mount', () => {
  test('401 without X-API-Key', async () => {
    const app = express();
    app.use(express.json());
    app.use(
      createAdminVapiCampaignsRouter({
        getApiKey: () => 'secret',
        startColdCallCampaign: async () => [],
        getOptimalCallTime: () => '09:00-10:00',
        generateFollowUpPlan: () => 'plan',
        generateVoicemailFollowUpEmail: () => ({}),
        generateDemoConfirmationEmail: () => ({}),
        generateObjectionHandlingEmail: () => ({}),
        generatePersonalizedScript: () => ({ firstMessage: 'hi', systemMessage: 'sys' }),
      }),
    );

    const res = await request(app).post('/admin/vapi/lead-scoring').send({ businesses: [] });
    expect(res.status).toBe(401);
  });
});

