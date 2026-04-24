import { describe, test, expect, jest } from '@jest/globals';
import { handleNotifyTest, handleNotifySend } from '../../lib/notify-api.js';

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

describe('lib/notify-api', () => {
  test('handleNotifyTest returns ok', () => {
    const res = mockRes();
    handleNotifyTest({}, res);
    expect(res.body).toEqual({ ok: true, message: 'Test route works!' });
  });

  test('handleNotifySend failure: unknown tenant', async () => {
    const req = { body: { channel: 'sms', message: 'hi' }, get: () => '' };
    const res = mockRes();
    await handleNotifySend(req, res, {
      getClientFromHeader: async () => null,
      query: jest.fn(),
      smsConfig: () => ({}),
      normalizePhoneE164: (p) => p,
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/Unknown tenant/);
  });

  test('handleNotifySend failure: wrong channel', async () => {
    const req = { body: { channel: 'email', message: 'hi' }, get: () => '' };
    const res = mockRes();
    await handleNotifySend(req, res, {
      getClientFromHeader: async () => ({ clientKey: 'c1' }),
      query: jest.fn(),
      smsConfig: () => ({}),
      normalizePhoneE164: (p) => p,
    });
    expect(res.statusCode).toBe(400);
  });

  test('handleNotifySend happy: sends SMS when configured', async () => {
    const req = { body: { channel: 'sms', message: 'Hello', to: '+447700900000' }, get: () => '' };
    const res = mockRes();
    const messagesCreate = jest.fn(async () => ({ sid: 'SMxx' }));
    await handleNotifySend(req, res, {
      getClientFromHeader: async () => ({ clientKey: 'c1' }),
      query: jest.fn(),
      smsConfig: () => ({
        configured: true,
        smsClient: { messages: { create: messagesCreate } },
        messagingServiceSid: 'MGxx',
        fromNumber: null,
      }),
      normalizePhoneE164: (p) => p,
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true, sid: 'SMxx' });
    expect(messagesCreate).toHaveBeenCalled();
  });
});
