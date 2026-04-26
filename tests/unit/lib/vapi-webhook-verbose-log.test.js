import { describe, expect, test, jest, beforeEach } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
  delete process.env.VAPI_WEBHOOK_VERBOSE;
  delete process.env.NODE_ENV;
});

describe('lib/vapi-webhook-verbose-log', () => {
  test('isVapiWebhookVerbose honors env overrides and vapiWebhookVerboseLog gates console.log', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});

    process.env.NODE_ENV = 'production';
    const mod1 = await import('../../../lib/vapi-webhook-verbose-log.js');
    expect(mod1.isVapiWebhookVerbose()).toBe(false);
    mod1.vapiWebhookVerboseLog('x');
    expect(log).not.toHaveBeenCalled();

    jest.resetModules();
    process.env.NODE_ENV = 'production';
    process.env.VAPI_WEBHOOK_VERBOSE = 'true';
    const mod2 = await import('../../../lib/vapi-webhook-verbose-log.js');
    expect(mod2.isVapiWebhookVerbose()).toBe(true);
    mod2.vapiWebhookVerboseLog('y');
    expect(log).toHaveBeenCalled();

    log.mockRestore();
  });
});

