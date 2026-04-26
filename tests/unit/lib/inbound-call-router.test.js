import { describe, test, expect, jest, beforeEach } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
  delete process.env.VAPI_PRIVATE_KEY;
  process.env.VAPI_ASSISTANT_ID = 'asst_default';
  process.env.VAPI_PHONE_NUMBER_ID = 'pn_default';
});

describe('lib/inbound-call-router', () => {
  test('routeInboundCall builds vapiConfig using provided clientKey', async () => {
    jest.unstable_mockModule('../../../db.js', () => ({
      getFullClient: jest.fn(async () => ({
        client_key: 'c1',
        display_name: 'Acme',
        timezone: 'Europe/London',
        vapi: { assistantId: 'asst1', phoneNumberId: 'pn1' },
      })),
    }));
    jest.unstable_mockModule('../../../lib/messaging-service.js', () => ({ default: {} }));
    jest.unstable_mockModule('../../../lib/demo-telemetry.js', () => ({ recordReceptionistTelemetry: jest.fn(async () => {}) }));

    const { routeInboundCall } = await import('../../../lib/inbound-call-router.js');
    const out = await routeInboundCall({
      fromPhone: '+447700900000',
      toPhone: '+447700900111',
      callSid: 'CA1',
      clientKey: 'c1',
    });
    expect(out).toEqual(expect.objectContaining({ success: true, vapiConfig: expect.any(Object), client: expect.any(Object) }));
    expect(out.vapiConfig.assistantId).toBe('asst1');
  });

  test('createVapiInboundCall mock mode returns success and telemetry is called', async () => {
    const recordReceptionistTelemetry = jest.fn(async () => {});
    jest.unstable_mockModule('../../../db.js', () => ({ getFullClient: jest.fn(async () => ({})) }));
    jest.unstable_mockModule('../../../lib/demo-telemetry.js', () => ({ recordReceptionistTelemetry }));
    jest.unstable_mockModule('../../../lib/messaging-service.js', () => ({ default: {} }));

    const { createVapiInboundCall } = await import('../../../lib/inbound-call-router.js');
    const out = await createVapiInboundCall(
      { assistantId: 'asst', phoneNumberId: 'pn', customer: { number: '+1' }, metadata: { clientKey: 'c1' } },
      { mock: true },
    );
    expect(out).toEqual(expect.objectContaining({ success: true, callId: expect.any(String), vapiCall: expect.any(Object) }));
    expect(recordReceptionistTelemetry).toHaveBeenCalled();
  });

  test('logInboundCall swallows db errors (table missing)', async () => {
    jest.unstable_mockModule('../../../db.js', () => ({
      getFullClient: jest.fn(async () => ({})),
      query: jest.fn(async () => {
        throw new Error('missing');
      }),
    }));
    jest.unstable_mockModule('../../../lib/demo-telemetry.js', () => ({ recordReceptionistTelemetry: jest.fn(async () => {}) }));
    jest.unstable_mockModule('../../../lib/messaging-service.js', () => ({ default: {} }));

    const { logInboundCall } = await import('../../../lib/inbound-call-router.js');
    await expect(
      logInboundCall({ clientKey: 'c1', callSid: 'CA1', fromPhone: '+1', toPhone: '+2', vapiCallId: 'v1', status: 'x' }),
    ).resolves.toBeUndefined();
  });
});

