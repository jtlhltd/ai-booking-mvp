import { jest } from '@jest/globals';
import {
  forwardToCursorAutomationWebhook,
  CURSOR_AUTOMATION_TYPES
} from '../../../lib/cursor-automation-webhook.js';
import { resetAutomationTriggerDedupeForTests } from '../../../lib/automation-trigger-dedupe.js';

describe('lib/cursor-automation-webhook', () => {
  const originalFetch = global.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    resetAutomationTriggerDedupeForTests();
    process.env.CURSOR_CI_FAIL_WEBHOOK_URL = 'https://api2.cursor.sh/automations/webhook/ci';
    process.env.CURSOR_CI_FAIL_WEBHOOK_AUTH = 'crsr_ci';
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ success: true })
    }));
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
    resetAutomationTriggerDedupeForTests();
  });

  test('CURSOR_AUTOMATION_TYPES includes expected automations', () => {
    expect(Object.keys(CURSOR_AUTOMATION_TYPES).sort()).toEqual(
      ['ci-failed', 'dependabot', 'deploy-failed', 'sentry-self-heal'].sort()
    );
  });

  test('forwardToCursorAutomationWebhook dedupes by automation namespace', async () => {
    const payload = { source: 'test', dedupeId: 'run-1' };
    await forwardToCursorAutomationWebhook({
      automationType: 'ci-failed',
      payload,
      dedupeId: 'run-1'
    });
    const second = await forwardToCursorAutomationWebhook({
      automationType: 'ci-failed',
      payload,
      dedupeId: 'run-1'
    });
    expect(second.deduped).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
