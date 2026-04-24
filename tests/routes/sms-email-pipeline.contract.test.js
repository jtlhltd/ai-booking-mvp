import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import request from 'supertest';

import { createContractApp, withEnv } from '../helpers/contract-harness.js';

beforeEach(() => {
  jest.resetModules();
});

describe('routes/sms-email-pipeline.js contracts', () => {
  test('POST /api/initiate-lead-capture returns 400 on missing leadData', async () => {
    const { createSmsEmailPipelineRouter } = await import('../../routes/sms-email-pipeline.js');
    const router = createSmsEmailPipelineRouter({ smsEmailPipeline: {} });
    const app = createContractApp({ mounts: [{ path: '/', router }] });

    const res = await request(app).post('/api/initiate-lead-capture').send({}).expect(400);
    expect(res.body).toEqual(
      expect.objectContaining({ success: false, message: expect.stringMatching(/Missing required lead data/i) })
    );
  });

  test('POST /api/initiate-lead-capture returns 503 when pipeline missing', async () => {
    const { createSmsEmailPipelineRouter } = await import('../../routes/sms-email-pipeline.js');
    const router = createSmsEmailPipelineRouter({ smsEmailPipeline: null });
    const app = createContractApp({ mounts: [{ path: '/', router }] });

    const res = await request(app)
      .post('/api/initiate-lead-capture')
      .send({ leadData: { phoneNumber: '+441', decisionMaker: 'A' } })
      .expect(503);
    expect(res.body).toEqual(expect.objectContaining({ success: false }));
  });

  test('POST /api/process-email-response returns 500 when pipeline throws', async () => {
    const { createSmsEmailPipelineRouter } = await import('../../routes/sms-email-pipeline.js');
    const router = createSmsEmailPipelineRouter({
      smsEmailPipeline: {
        processEmailResponse: jest.fn(async () => {
          throw new Error('boom');
        })
      }
    });
    const app = createContractApp({ mounts: [{ path: '/', router }] });

    const res = await request(app)
      .post('/api/process-email-response')
      .send({ phoneNumber: '+441', emailAddress: 'a@b.com' })
      .expect(500);
    expect(res.body).toEqual(expect.objectContaining({ success: false, error: 'boom' }));
  });

  test('POST /webhook/sms-reply returns success when no email found (pipeline missing)', async () => {
    await withEnv({ TWILIO_AUTH_TOKEN: undefined }, async () => {
      jest.unstable_mockModule('../../lib/security.js', () => ({
        twilioWebhookVerification: (_req, _res, next) => next()
      }));

      const { createSmsEmailPipelineRouter } = await import('../../routes/sms-email-pipeline.js');
      const router = createSmsEmailPipelineRouter({ smsEmailPipeline: null });
      const app = createContractApp({ mounts: [{ path: '/', router }], json: false });

      const res = await request(app)
        .post('/webhook/sms-reply')
        .type('form')
        .send({ From: '+441', Body: 'hello' })
        .expect(200);

      expect(res.body).toEqual(
        expect.objectContaining({
          success: true,
          message: expect.stringMatching(/no email found|webhook working/i)
        })
      );
    });
  });

  test('POST /webhooks/sms returns 200 OK and calls pipeline on emailMatch', async () => {
    await withEnv({ TWILIO_AUTH_TOKEN: undefined, BASE_URL: 'http://localhost:3000' }, async () => {
      jest.unstable_mockModule('../../lib/security.js', () => ({
        twilioWebhookVerification: (_req, _res, next) => next()
      }));

      const processEmailResponse = jest.fn(async () => ({
        success: false,
        message: 'No pending lead found for this phone number'
      }));
      const sendConfirmationEmail = jest.fn(async () => ({}));
      const sendSMS = jest.fn(async () => ({}));

      const { createSmsEmailPipelineRouter } = await import('../../routes/sms-email-pipeline.js');
      const router = createSmsEmailPipelineRouter({
        smsEmailPipeline: { processEmailResponse, sendConfirmationEmail, sendSMS }
      });
      const app = createContractApp({ mounts: [{ path: '/', router }], json: false });

      await request(app)
        .post('/webhooks/sms')
        .type('form')
        .send({ From: '+441', Body: 'hi a@b.com' })
        .expect(200);

      expect(processEmailResponse).toHaveBeenCalled();
      expect(sendConfirmationEmail).toHaveBeenCalled();
      expect(sendSMS).toHaveBeenCalled();
    });
  });
});

