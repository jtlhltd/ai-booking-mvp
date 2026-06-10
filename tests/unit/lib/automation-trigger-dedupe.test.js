import {
  beginAutomationTrigger,
  completeAutomationTrigger,
  resetAutomationTriggerDedupeForTests,
  shouldDedupeAutomationTrigger
} from '../../../lib/automation-trigger-dedupe.js';

describe('lib/automation-trigger-dedupe', () => {
  const originalCooldown = process.env.AUTOMATION_TRIGGER_COOLDOWN_MS;

  beforeEach(() => {
    resetAutomationTriggerDedupeForTests();
    process.env.AUTOMATION_TRIGGER_COOLDOWN_MS = '60000';
  });

  afterEach(() => {
    if (originalCooldown === undefined) delete process.env.AUTOMATION_TRIGGER_COOLDOWN_MS;
    else process.env.AUTOMATION_TRIGGER_COOLDOWN_MS = originalCooldown;
    resetAutomationTriggerDedupeForTests();
  });

  test('shouldDedupeAutomationTrigger blocks repeat triggers within cooldown', () => {
    completeAutomationTrigger('ci-failed', 'run-1', { succeeded: true });
    expect(shouldDedupeAutomationTrigger('ci-failed', 'run-1').dedupe).toBe(true);
  });

  test('namespaces are isolated', () => {
    completeAutomationTrigger('ci-failed', 'run-1', { succeeded: true });
    expect(shouldDedupeAutomationTrigger('dependabot', 'run-1').dedupe).toBe(false);
  });

  test('beginAutomationTrigger blocks concurrent in-flight triggers', () => {
    expect(beginAutomationTrigger('deploy-failed', 'dep-1')).toBe(true);
    expect(shouldDedupeAutomationTrigger('deploy-failed', 'dep-1').reason).toBe('in_flight');
    completeAutomationTrigger('deploy-failed', 'dep-1', { succeeded: true });
    expect(shouldDedupeAutomationTrigger('deploy-failed', 'dep-1').dedupe).toBe(true);
  });
});
