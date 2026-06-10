import { jest } from '@jest/globals';
import {
  buildCursorSelfHealPayload,
  extractSentryIssueContext,
  forwardToCursorSelfHealWebhook
} from '../../../lib/sentry-cursor-relay.js';
import { resetSelfHealTriggerDedupeForTests } from '../../../lib/sentry-self-heal-trigger-dedupe.js';

describe('lib/sentry-cursor-relay', () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.CURSOR_SELF_HEAL_WEBHOOK_URL;
  const originalAuth = process.env.CURSOR_SELF_HEAL_WEBHOOK_AUTH;

  beforeEach(() => {
    resetSelfHealTriggerDedupeForTests();
    process.env.CURSOR_SELF_HEAL_WEBHOOK_URL = 'https://api2.cursor.sh/automations/webhook/test';
    process.env.CURSOR_SELF_HEAL_WEBHOOK_AUTH = 'crsr_testtoken';
    process.env.SENTRY_SELF_HEAL_TRIGGER_COOLDOWN_MS = '60000';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.CURSOR_SELF_HEAL_WEBHOOK_URL;
    else process.env.CURSOR_SELF_HEAL_WEBHOOK_URL = originalUrl;
    if (originalAuth === undefined) delete process.env.CURSOR_SELF_HEAL_WEBHOOK_AUTH;
    else process.env.CURSOR_SELF_HEAL_WEBHOOK_AUTH = originalAuth;
    delete process.env.SENTRY_SELF_HEAL_TRIGGER_COOLDOWN_MS;
    resetSelfHealTriggerDedupeForTests();
  });
  test('extractSentryIssueContext reads nested Sentry alert payload', () => {
    expect(
      extractSentryIssueContext({
        data: {
          issue: {
            id: 'AI-BOOKING-MVP-7',
            url: 'https://jtlh-ltd.sentry.io/issues/AI-BOOKING-MVP-7',
            project: { slug: 'ai-booking-mvp' }
          }
        }
      })
    ).toEqual({
      issueId: 'AI-BOOKING-MVP-7',
      issueUrl: 'https://jtlh-ltd.sentry.io/issues/AI-BOOKING-MVP-7',
      projectSlug: 'ai-booking-mvp',
      organizationSlug: null
    });
  });

  test('buildCursorSelfHealPayload normalizes manual webhook shape', () => {
    expect(
      buildCursorSelfHealPayload({
        issue: { id: 'AI-BOOKING-MVP-6' },
        project: 'ai-booking-mvp',
        organization: 'jtlh-ltd'
      })
    ).toEqual({
      source: 'sentry-self-heal-relay',
      organization: 'jtlh-ltd',
      project: 'ai-booking-mvp',
      issue: {
        id: 'AI-BOOKING-MVP-6',
        url: 'https://jtlh-ltd.sentry.io/issues/AI-BOOKING-MVP-6'
      }
    });
  });

  test('forwardToCursorSelfHealWebhook dedupes repeat issue within cooldown', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ success: true, backgroundComposerId: 'bc-1' })
    }));

    const body = { issue: { id: 'AI-BOOKING-MVP-6' }, project: 'ai-booking-mvp' };
    const first = await forwardToCursorSelfHealWebhook(body);
    const second = await forwardToCursorSelfHealWebhook(body);

    expect(first.deduped).toBeFalsy();
    expect(second.deduped).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
