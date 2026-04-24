import { describe, test, expect, jest } from '@jest/globals';
import { handleSmsStatusWebhook } from '../../lib/sms-status-webhook.js';

function mockRes() {
  const res = {};
  res.statusCode = 200;
  res.sent = null;
  res.type = () => res;
  res.send = (b) => {
    res.sent = b;
    return res;
  };
  return res;
}

describe('lib/sms-status-webhook', () => {
  test('happy: updates DB and appends json log', async () => {
    const query = jest.fn(async () => ({ rows: [{ id: 1 }] }));
    const readJson = jest.fn(async () => []);
    const writeJson = jest.fn(async () => {});
    const req = {
      id: 'r1',
      body: { MessageSid: 'SM1', MessageStatus: 'delivered', To: '+1', From: '+2' },
    };
    const res = mockRes();
    await handleSmsStatusWebhook(req, res, {
      query,
      readJson,
      writeJson,
      smsStatusPath: '/tmp/sms-status-test.json',
    });
    expect(query).toHaveBeenCalled();
    expect(writeJson).toHaveBeenCalled();
    expect(res.sent).toBe('OK');
  });

  test('failure: still returns OK to Twilio when writeJson throws', async () => {
    const query = jest.fn(async () => ({ rows: [] }));
    const readJson = jest.fn(async () => []);
    const writeJson = jest.fn(async () => {
      throw new Error('disk full');
    });
    const req = { id: 'r1', body: { MessageSid: 'SM2', MessageStatus: 'sent' } };
    const res = mockRes();
    await handleSmsStatusWebhook(req, res, {
      query,
      readJson,
      writeJson,
      smsStatusPath: '/tmp/x.json',
    });
    expect(res.sent).toBe('OK');
  });

  test('failed status still appends json log and does not throw when email module fails', async () => {
    const prevEmail = process.env.YOUR_EMAIL;
    process.env.YOUR_EMAIL = 'ops@example.test';

    jest.unstable_mockModule('../../lib/messaging-service.js', () => ({
      default: { sendEmail: jest.fn(async () => { throw new Error('smtp_down'); }) }
    }));

    const query = jest.fn(async () => ({ rows: [{ id: 1 }] }));
    const readJson = jest.fn(async () => []);
    const writeJson = jest.fn(async () => {});
    const req = {
      id: 'r1',
      body: { MessageSid: 'SM9', MessageStatus: 'failed', To: '+1', From: '+2', ErrorCode: '30001' },
    };
    const res = mockRes();

    await handleSmsStatusWebhook(req, res, {
      query,
      readJson,
      writeJson,
      smsStatusPath: '/tmp/sms-status-test.json',
    });

    expect(writeJson).toHaveBeenCalledTimes(1);
    expect(res.sent).toBe('OK');

    process.env.YOUR_EMAIL = prevEmail;
  });
});
