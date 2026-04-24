import { describe, test, expect } from '@jest/globals';
import { handleSmsTestEndpoint } from '../../lib/sms-test-endpoint.js';

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

describe('lib/sms-test-endpoint', () => {
  test('failure: missing API key returns 401', async () => {
    const req = { get: () => '', body: {} };
    const res = mockRes();
    await handleSmsTestEndpoint(req, res, { getApiKey: () => 'secret' });
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  test('happy: echoes Twilio-shaped body when key matches', async () => {
    const req = {
      get: (h) => (h === 'X-API-Key' ? 'secret' : ''),
      body: { From: '+1', To: '+2', Body: 'Yo', MessageSid: 'SM1' },
    };
    const res = mockRes();
    await handleSmsTestEndpoint(req, res, { getApiKey: () => 'secret' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        ok: true,
        from: '+1',
        to: '+2',
        body: 'Yo',
      })
    );
  });
});
