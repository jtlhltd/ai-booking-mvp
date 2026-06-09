import { jest } from '@jest/globals';

const forwardMock = jest.fn(async () => ({ status: 200, body: { success: true }, payload: {} }));

jest.unstable_mockModule('../../../lib/sentry-cursor-relay.js', () => ({
  forwardToCursorSelfHealWebhook: forwardMock
}));

describe('lib/sentry-self-heal-poller', () => {
  const originalFetch = global.fetch;
  const originalEnabled = process.env.SENTRY_SELF_HEAL_POLLER_ENABLED;
  const originalToken = process.env.SENTRY_AUTH_TOKEN;

  beforeEach(async () => {
    forwardMock.mockClear();
    const mod = await import('../../../lib/sentry-self-heal-poller.js');
    mod.resetSelfHealPollerStateForTests();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalEnabled === undefined) delete process.env.SENTRY_SELF_HEAL_POLLER_ENABLED;
    else process.env.SENTRY_SELF_HEAL_POLLER_ENABLED = originalEnabled;
    if (originalToken === undefined) delete process.env.SENTRY_AUTH_TOKEN;
    else process.env.SENTRY_AUTH_TOKEN = originalToken;
  });

  test('pollSentryForSelfHeal forwards recent unresolved issues', async () => {
    process.env.SENTRY_SELF_HEAL_POLLER_ENABLED = 'true';
    process.env.SENTRY_AUTH_TOKEN = 'test-token';
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => [
        {
          id: '123',
          shortId: 'AI-BOOKING-MVP-7',
          title: 'TypeError: Cannot read properties of null',
          culprit: 'GET /automation-smoke',
          lastSeen: new Date().toISOString()
        }
      ]
    }));

    const { pollSentryForSelfHeal } = await import('../../../lib/sentry-self-heal-poller.js');
    const result = await pollSentryForSelfHeal();

    expect(result.ok).toBe(true);
    expect(result.triggered).toEqual(['AI-BOOKING-MVP-7']);
    expect(forwardMock).toHaveBeenCalledTimes(1);
  });

  test('pollSentryForSelfHeal skips when disabled', async () => {
    delete process.env.SENTRY_SELF_HEAL_POLLER_ENABLED;
    const { pollSentryForSelfHeal } = await import('../../../lib/sentry-self-heal-poller.js');
    const result = await pollSentryForSelfHeal();
    expect(result.skipped).toBe(true);
    expect(forwardMock).not.toHaveBeenCalled();
  });
});
