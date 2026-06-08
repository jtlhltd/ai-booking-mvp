import { jest } from '@jest/globals';

describe('sentry-config', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('defaults production sample rate when env var is unset', async () => {
    const { resolveSentryTracesSampleRate } = await import('../../../lib/sentry-config.js');
    expect(resolveSentryTracesSampleRate({ envValue: undefined, environment: 'production' })).toBe(0.1);
    expect(resolveSentryTracesSampleRate({ envValue: '', environment: 'production' })).toBe(0.1);
    expect(resolveSentryTracesSampleRate({ envValue: '   ', environment: 'production' })).toBe(0.1);
  });

  it('defaults development sample rate when env var is unset', async () => {
    const { resolveSentryTracesSampleRate } = await import('../../../lib/sentry-config.js');
    expect(resolveSentryTracesSampleRate({ envValue: '', environment: 'development' })).toBe(1.0);
  });

  it('parses explicit sample rates', async () => {
    const { resolveSentryTracesSampleRate } = await import('../../../lib/sentry-config.js');
    expect(resolveSentryTracesSampleRate({ envValue: '0.25', environment: 'production' })).toBe(0.25);
    expect(resolveSentryTracesSampleRate({ envValue: '0', environment: 'production' })).toBe(0);
    expect(resolveSentryTracesSampleRate({ envValue: '1', environment: 'production' })).toBe(1);
  });

  it('falls back when sample rate is invalid', async () => {
    const { resolveSentryTracesSampleRate } = await import('../../../lib/sentry-config.js');
    expect(resolveSentryTracesSampleRate({ envValue: 'not-a-number', environment: 'production' })).toBe(0.1);
    expect(resolveSentryTracesSampleRate({ envValue: '2', environment: 'production' })).toBe(0.1);
    expect(console.warn).toHaveBeenCalled();
  });

  it('resolves environment from Render when NODE_ENV is unset', async () => {
    const { resolveSentryEnvironment } = await import('../../../lib/sentry-config.js');
    expect(resolveSentryEnvironment({ RENDER: 'true' })).toBe('production');
    expect(resolveSentryEnvironment({ SENTRY_ENVIRONMENT: 'staging', RENDER: 'true' })).toBe('staging');
  });
});
