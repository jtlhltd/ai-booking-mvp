import { describe, test, expect, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createMetaIngestWebhooksRouter } from '../../routes/meta-ingest-webhooks-mount.js';

describe('routes/meta-ingest-webhooks-mount', () => {
  test('POST /webhooks/new-lead/:clientKey returns 400 when phone missing', async () => {
    const app = express();
    app.use(express.json());
    app.use(
      createMetaIngestWebhooksRouter({
        webhooksNewLeadDeps: {
          getFullClient: jest.fn(async () => ({ clientKey: 'c1', vapiAssistantId: 'a', vapiPhoneNumberId: 'p' })),
          normalizePhoneE164: () => null,
          resolveVapiKey: () => 'k',
          resolveVapiAssistantId: () => 'asst',
          resolveVapiPhoneNumberId: () => 'pn',
          TIMEZONE: 'Europe/London',
          recordReceptionistTelemetry: jest.fn(),
          VAPI_URL: 'https://api.vapi.ai'
        },
        webhooksFacebookLeadDeps: {
          getBaseUrl: () => 'http://localhost:10000',
          nodeEnv: 'test'
        }
      })
    );

    const res = await request(app).post('/webhooks/new-lead/c1').send({});
    expect(res.status).toBe(400);
  });

  test('POST /webhooks/facebook-lead/:clientKey returns JSON', async () => {
    const app = express();
    app.use(express.json());
    app.use(
      createMetaIngestWebhooksRouter({
        webhooksNewLeadDeps: {
          getFullClient: jest.fn(),
          normalizePhoneE164: () => '+441',
          resolveVapiKey: () => 'k',
          resolveVapiAssistantId: () => 'a',
          resolveVapiPhoneNumberId: () => 'p',
          TIMEZONE: 'Europe/London',
          recordReceptionistTelemetry: jest.fn(),
          VAPI_URL: 'https://api.vapi.ai'
        },
        webhooksFacebookLeadDeps: {
          getBaseUrl: () => 'http://localhost:10000',
          nodeEnv: 'test'
        }
      })
    );

    const res = await request(app).post('/webhooks/facebook-lead/c1').send({ test: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});
