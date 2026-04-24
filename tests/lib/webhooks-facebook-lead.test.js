import { describe, test, expect, jest } from '@jest/globals';
import { handleWebhooksFacebookLead } from '../../lib/webhooks-facebook-lead.js';

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

describe('lib/webhooks-facebook-lead', () => {
  test('failure: invalid payload shape returns 400', async () => {
    const req = { params: { clientKey: 'c1' }, body: {} };
    const res = mockRes();
    await handleWebhooksFacebookLead(req, res, {});
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/Invalid Facebook/);
  });

  test('failure: missing phone in field_data returns 400', async () => {
    const req = {
      params: { clientKey: 'c1' },
      body: {
        entry: [{ changes: [{ value: { field_data: [{ name: 'full_name', values: ['A'] }], form_id: 'f' } }] }],
      },
    };
    const res = mockRes();
    await handleWebhooksFacebookLead(req, res, {});
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/Missing phone/);
  });

  test('happy: forwards transformed payload to new-lead URL', async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, id: 'call1' }),
    }));
    const req = {
      params: { clientKey: 'c1' },
      body: {
        entry: [
          {
            changes: [
              {
                value: {
                  leadgen_id: 'L1',
                  form_id: 'F1',
                  field_data: [{ name: 'phone_number', values: ['+447700900222'] }],
                },
              },
            ],
          },
        ],
      },
    };
    const res = mockRes();
    await handleWebhooksFacebookLead(req, res, {
      fetchImpl,
      getBaseUrl: () => 'http://test.local',
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://test.local/webhooks/new-lead/c1',
      expect.objectContaining({ method: 'POST' })
    );
  });
});
