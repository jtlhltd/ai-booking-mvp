import { jest } from '@jest/globals';
import { resolveSentryIssue } from '../../../lib/sentry-resolve-issue.js';

describe('lib/sentry-resolve-issue', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('resolveSentryIssue PUTs resolved status', async () => {
    global.fetch = jest.fn(async (url, init) => {
      if (String(url).includes('/comments/')) {
        return { ok: true, json: async () => ({}) };
      }
      expect(init.method).toBe('PUT');
      expect(JSON.parse(init.body).status).toBe('resolved');
      return { ok: true, json: async () => ({ status: 'resolved' }) };
    });

    const result = await resolveSentryIssue(
      { issue: { id: 'AI-BOOKING-MVP-7' } },
      { token: 'test-token', reason: 'verified' }
    );

    expect(result.issueId).toBe('AI-BOOKING-MVP-7');
    expect(result.status).toBe('resolved');
  });
});
