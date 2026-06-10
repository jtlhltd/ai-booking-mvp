import { buildGithubAutomationPayload } from '../../../lib/github-automation-relay.js';

describe('lib/github-automation-relay', () => {
  test('buildGithubAutomationPayload normalizes ci-failed', () => {
    expect(
      buildGithubAutomationPayload({
        type: 'ci-failed',
        runId: '12345',
        runUrl: 'https://github.com/jtlhltd/ai-booking-mvp/actions/runs/12345',
        repository: 'jtlhltd/ai-booking-mvp',
        branch: 'main',
        workflow: 'CI',
        commit: 'abc123'
      })
    ).toMatchObject({
      automation: 'ci-failed',
      dedupeId: '12345',
      repository: 'jtlhltd/ai-booking-mvp',
      branch: 'main'
    });
  });

  test('buildGithubAutomationPayload normalizes dependabot-pr', () => {
    expect(
      buildGithubAutomationPayload({
        type: 'dependabot-pr',
        pullNumber: 20,
        pullUrl: 'https://github.com/jtlhltd/ai-booking-mvp/pull/20',
        title: 'chore(deps): bump express-rate-limit',
        repository: 'jtlhltd/ai-booking-mvp'
      })
    ).toMatchObject({
      automation: 'dependabot',
      dedupeId: '20',
      pullNumber: 20
    });
  });
});
