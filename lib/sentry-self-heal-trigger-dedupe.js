/** @deprecated Use automation-trigger-dedupe.js — kept for existing imports. */
import {
  automationTriggerCooldownRemaining,
  beginAutomationTrigger,
  completeAutomationTrigger,
  resetAutomationTriggerDedupeForTests,
  shouldDedupeAutomationTrigger
} from './automation-trigger-dedupe.js';

const NS = 'sentry-self-heal';

export function selfHealTriggerCooldownRemaining(issueId) {
  return automationTriggerCooldownRemaining(NS, issueId);
}

export function shouldDedupeSelfHealTrigger(issueId, options = {}) {
  return shouldDedupeAutomationTrigger(NS, issueId, options);
}

export function beginSelfHealTrigger(issueId) {
  return beginAutomationTrigger(NS, issueId);
}

export function completeSelfHealTrigger(issueId, options = {}) {
  return completeAutomationTrigger(NS, issueId, options);
}

export { resetAutomationTriggerDedupeForTests as resetSelfHealTriggerDedupeForTests };
