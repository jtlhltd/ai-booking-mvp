import { describe, expect, test, jest, beforeEach } from '@jest/globals';

const query = jest.fn(async () => ({ rows: [{ id: 123 }] }));
jest.unstable_mockModule('../../../db.js', () => ({ query }));

jest.unstable_mockModule('../../../lib/messaging-service.js', () => ({
  default: { sendEmail: jest.fn(async () => ({ ok: true })) }
}));

describe('webhook-retry', () => {
  beforeEach(() => {
    jest.resetModules();
    query.mockClear();
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, statusText: 'OK' }));
    process.env.BASE_URL = 'http://localhost:3000';
  });

  test('addWebhookToRetryQueue inserts retry_queue row with computed schedule', async () => {
    const { addWebhookToRetryQueue } = await import('../../../lib/webhook-retry.js');
    const before = Date.now();
    const res = await addWebhookToRetryQueue({
      webhookType: 'vapi',
      webhookUrl: '/webhooks/vapi',
      payload: { metadata: { clientKey: 'c1', leadPhone: '+447700900000' } },
      headers: { 'X-Test': '1' },
      attempt: 2
    });

    expect(res).toEqual({ success: true, id: 123 });
    expect(query).toHaveBeenCalled();

    const args = query.mock.calls[0][1];
    const scheduledFor = args[5];
    expect(scheduledFor).toBeInstanceOf(Date);
    expect(scheduledFor.getTime()).toBeGreaterThan(before);
  });

  test('processWebhookRetryQueue marks completed when retry succeeds', async () => {
    query.mockImplementationOnce(async () => ({
      rows: [
        {
          id: 1,
          retry_attempt: 1,
          max_retries: 5,
          client_key: 'c1',
          retry_data: JSON.stringify({
            webhookType: 'vapi',
            webhookUrl: '/webhooks/vapi',
            payload: { ok: true },
            headers: {}
          })
        }
      ]
    }));
    // processing update
    query.mockImplementationOnce(async () => ({ rows: [] }));
    // completed update
    query.mockImplementationOnce(async () => ({ rows: [] }));

    const { processWebhookRetryQueue } = await import('../../../lib/webhook-retry.js');
    const out = await processWebhookRetryQueue();
    expect(out).toEqual(expect.objectContaining({ processed: 1, success: 1, failed: 0 }));
    expect(global.fetch).toHaveBeenCalledWith('http://localhost:3000/webhooks/vapi', expect.any(Object));
  });

  test('processWebhookRetryQueue schedules next retry when response not ok and attempts remain', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 500, statusText: 'Oops' }));

    query.mockImplementationOnce(async () => ({
      rows: [
        {
          id: 2,
          retry_attempt: 1,
          max_retries: 5,
          client_key: 'c1',
          retry_data: JSON.stringify({
            webhookType: 'vapi',
            webhookUrl: '/webhooks/vapi',
            payload: { ok: true },
            headers: {}
          })
        }
      ]
    }));
    // processing update
    query.mockImplementationOnce(async () => ({ rows: [] }));
    // schedule next retry update
    query.mockImplementationOnce(async () => ({ rows: [] }));

    const { processWebhookRetryQueue } = await import('../../../lib/webhook-retry.js');
    const out = await processWebhookRetryQueue();
    expect(out).toEqual(expect.objectContaining({ processed: 1, success: 0 }));
  });
});

