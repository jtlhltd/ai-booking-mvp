import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

describe('sentry tracing helpers', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    delete process.env.SENTRY_DSN;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  test('startSpan no-ops without DSN', async () => {
    const { startSpan } = await import('../../../lib/sentry.js');
    const fn = jest.fn(async () => 'ok');
    const result = await startSpan({ name: 'test.span', op: 'test', attributes: { clientKey: 'acme' } }, fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('startSpan calls Sentry.startSpan with merged attributes when DSN is set', async () => {
    process.env.SENTRY_DSN = 'https://example@o0.ingest.sentry.io/0';
    const startSpanMock = jest.fn(async (_opts, fn) => {
      const span = { setAttribute: jest.fn(), setTag: jest.fn() };
      return fn(span);
    });
    jest.unstable_mockModule('@sentry/node', () => ({
      startSpan: startSpanMock,
      withScope: jest.fn((cb) => cb({ setTag: jest.fn(), setExtra: jest.fn() })),
      withIsolationScope: jest.fn((cb) => cb()),
      captureException: jest.fn(),
      captureMessage: jest.fn(),
      setupExpressErrorHandler: jest.fn(),
    }));

    const { startSpan, applySpanAttributes } = await import('../../../lib/sentry.js');
    const fn = jest.fn(async (span) => {
      applySpanAttributes(span, { correlationId: 'corr-1' });
      return 'done';
    });

    const result = await startSpan(
      { name: 'vapi.webhook.process', op: 'vapi.webhook', attributes: { callId: 'call-1' } },
      fn
    );

    expect(result).toBe('done');
    expect(startSpanMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'vapi.webhook.process',
        op: 'vapi.webhook',
        attributes: expect.objectContaining({ callId: 'call-1' }),
      }),
      expect.any(Function)
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('runIsolatedSpan schedules work without DSN', async () => {
    const { runIsolatedSpan } = await import('../../../lib/sentry.js');
    const fn = jest.fn(async () => {});
    runIsolatedSpan({ name: 'vapi.webhook.process_async', op: 'vapi.webhook' }, fn);
    await new Promise((r) => setImmediate(r));
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
