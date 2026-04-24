import { describe, test, expect, jest } from '@jest/globals';
import { handleWebhooksNewLead } from '../../lib/webhooks-new-lead.js';

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

describe('lib/webhooks-new-lead', () => {
  test('failure: unknown clientKey returns 404', async () => {
    const req = { params: { clientKey: 'nope' }, body: { phone: '+447700900000' } };
    const res = mockRes();
    await handleWebhooksNewLead(req, res, {
      getFullClient: async () => null,
      normalizePhoneE164: (p) => p,
      resolveVapiKey: () => 'k',
      resolveVapiAssistantId: () => 'a',
      resolveVapiPhoneNumberId: () => 'p',
      TIMEZONE: 'Europe/London',
      recordReceptionistTelemetry: async () => {},
      VAPI_URL: 'https://api.vapi.ai',
    });
    expect(res.statusCode).toBe(404);
  });

  test('failure: missing phone returns 400', async () => {
    const req = { params: { clientKey: 'c1' }, body: {} };
    const res = mockRes();
    await handleWebhooksNewLead(req, res, {
      getFullClient: async () => ({ clientKey: 'c1', displayName: 'D' }),
      normalizePhoneE164: () => null,
      resolveVapiKey: () => 'k',
      resolveVapiAssistantId: () => 'a',
      resolveVapiPhoneNumberId: () => 'p',
      TIMEZONE: 'Europe/London',
      recordReceptionistTelemetry: async () => {},
      VAPI_URL: 'https://api.vapi.ai',
    });
    expect(res.statusCode).toBe(400);
  });

  test('happy: mock_vapi short-circuits without fetch', async () => {
    const prev = process.env.RECEPTIONIST_TEST_MODE;
    process.env.RECEPTIONIST_TEST_MODE = 'mock_vapi';
    try {
      const req = {
        params: { clientKey: 'c1' },
        body: { phone: '+447700900111' },
      };
      const res = mockRes();
      const telemetry = jest.fn(async () => {});
      await handleWebhooksNewLead(req, res, {
        getFullClient: async () => ({
          clientKey: 'c1',
          displayName: 'D',
          vapiAssistantId: 'asst',
          vapiPhoneNumberId: 'ph',
          booking: { timezone: 'Europe/London', defaultDurationMin: 30 },
        }),
        normalizePhoneE164: (p) => p,
        resolveVapiKey: () => 'k',
        resolveVapiAssistantId: (c) => c.vapiAssistantId,
        resolveVapiPhoneNumberId: (c) => c.vapiPhoneNumberId,
        TIMEZONE: 'Europe/London',
        recordReceptionistTelemetry: telemetry,
        VAPI_URL: 'https://api.vapi.ai',
      });
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual(expect.objectContaining({ ok: true, mock: true }));
    } finally {
      process.env.RECEPTIONIST_TEST_MODE = prev;
    }
  });
});
