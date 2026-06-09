import {
  buildCursorSelfHealPayload,
  extractSentryIssueContext
} from '../../../lib/sentry-cursor-relay.js';

describe('lib/sentry-cursor-relay', () => {
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
});
