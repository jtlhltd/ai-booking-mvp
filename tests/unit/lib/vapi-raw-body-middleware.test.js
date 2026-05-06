import { describe, expect, test, jest, beforeEach } from '@jest/globals';

describe('lib/vapi-webhooks/raw-body-middleware', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.unstable_mockModule('../../../lib/vapi-webhook-verbose-log.js', () => ({
      vapiWebhookVerboseLog: jest.fn()
    }));
  });

  test('parses JSON from rawBody buffer', async () => {
    const { createVapiRawBodyMiddleware } = await import('../../../lib/vapi-webhooks/raw-body-middleware.js');
    const mw = createVapiRawBodyMiddleware();
    const req = { rawBody: Buffer.from('{"a":1}', 'utf8'), body: null };
    const next = jest.fn();
    mw(req, {}, next);
    expect(req.body).toEqual({ a: 1 });
    expect(next).toHaveBeenCalled();
  });

  test('uses parsed object body and sets rawBody', async () => {
    const { createVapiRawBodyMiddleware } = await import('../../../lib/vapi-webhooks/raw-body-middleware.js');
    const mw = createVapiRawBodyMiddleware();
    const req = { body: { x: 2 } };
    const next = jest.fn();
    mw(req, {}, next);
    expect(Buffer.isBuffer(req.rawBody)).toBe(true);
    expect(next).toHaveBeenCalled();
  });
});
