import { describe, expect, test, jest, beforeEach, afterEach } from '@jest/globals';

describe('integration-statuses', () => {
  let fetchSpy;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes('vapi.ai')) {
        return { ok: true, status: 200, text: async () => '' };
      }
      if (u.includes('twilio.com')) {
        return { ok: true, status: 200, text: async () => '' };
      }
      return { ok: false, status: 500, text: async () => '' };
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  test('requires clientKey for each integration slot when missing', async () => {
    const { getIntegrationStatuses } = await import('../../../lib/integration-statuses.js');
    const r = await getIntegrationStatuses('', { query: jest.fn() });
    expect(r.find((i) => i.name === 'Vapi Voice')?.status).toBe('error');
    expect(r.find((i) => i.name === 'Twilio SMS')?.detail).toMatch(/Client key required/);
  });

  test('marks Vapi error when tenant row missing', async () => {
    const { getIntegrationStatuses } = await import('../../../lib/integration-statuses.js');
    const r = await getIntegrationStatuses('nope', {
      query: jest.fn(async () => ({ rows: [] }))
    });
    expect(r.find((i) => i.name === 'Vapi Voice')?.status).toBe('error');
  });

  test('happy path verifies Vapi + Twilio via fetch and calendar from json', async () => {
    const query = jest.fn(async (sql) => {
      const s = String(sql);
      if (s.includes('calendar_json')) {
        return { rows: [{ calendar_json: { service_account_email: 'svc@x' } }] };
      }
      return {
        rows: [
          {
            vapi_json: { assistantId: 'asst', phoneNumberId: 'ph', privateKey: 'pk_test' },
            twilio_json: { accountSid: 'ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', authToken: 'tok' }
          }
        ]
      };
    });
    const { getIntegrationStatuses } = await import('../../../lib/integration-statuses.js');
    const r = await getIntegrationStatuses('acme', { query });
    expect(r.find((i) => i.name === 'Vapi Voice')?.status).toBe('active');
    expect(r.find((i) => i.name === 'Twilio SMS')?.status).toBe('active');
    expect(r.find((i) => i.name === 'Google Calendar')?.status).toBe('active');
  });

  test('maps missing vapi_json column to schema error', async () => {
    const query = jest.fn(async () => {
      const e = new Error('column "vapi_json" does not exist');
      throw e;
    });
    const { getIntegrationStatuses } = await import('../../../lib/integration-statuses.js');
    const r = await getIntegrationStatuses('acme', { query });
    expect(r.find((i) => i.name === 'Vapi Voice')?.detail).toMatch(/schema/i);
  });
});
