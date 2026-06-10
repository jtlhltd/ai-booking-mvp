import {
  beginSelfHealTrigger,
  completeSelfHealTrigger,
  resetSelfHealTriggerDedupeForTests,
  selfHealTriggerCooldownRemaining,
  shouldDedupeSelfHealTrigger
} from '../../../lib/sentry-self-heal-trigger-dedupe.js';

describe('lib/sentry-self-heal-trigger-dedupe', () => {
  const originalCooldown = process.env.SENTRY_SELF_HEAL_TRIGGER_COOLDOWN_MS;

  beforeEach(() => {
    resetSelfHealTriggerDedupeForTests();
    process.env.SENTRY_SELF_HEAL_TRIGGER_COOLDOWN_MS = '60000';
  });

  afterEach(() => {
    if (originalCooldown === undefined) delete process.env.SENTRY_SELF_HEAL_TRIGGER_COOLDOWN_MS;
    else process.env.SENTRY_SELF_HEAL_TRIGGER_COOLDOWN_MS = originalCooldown;
    resetSelfHealTriggerDedupeForTests();
  });

  test('shouldDedupeSelfHealTrigger blocks repeat triggers within cooldown', () => {
    completeSelfHealTrigger('AI-BOOKING-MVP-6', { succeeded: true });
    expect(shouldDedupeSelfHealTrigger('AI-BOOKING-MVP-6').dedupe).toBe(true);
    expect(selfHealTriggerCooldownRemaining('ai-booking-mvp-6')).toBeGreaterThan(0);
  });

  test('shouldDedupeSelfHealTrigger allows force bypass', () => {
    completeSelfHealTrigger('AI-BOOKING-MVP-6', { succeeded: true });
    expect(shouldDedupeSelfHealTrigger('AI-BOOKING-MVP-6', { force: true }).dedupe).toBe(false);
  });

  test('beginSelfHealTrigger blocks concurrent in-flight triggers', () => {
    expect(beginSelfHealTrigger('AI-BOOKING-MVP-6')).toBe(true);
    expect(shouldDedupeSelfHealTrigger('AI-BOOKING-MVP-6').reason).toBe('in_flight');
    completeSelfHealTrigger('AI-BOOKING-MVP-6', { succeeded: true });
    expect(shouldDedupeSelfHealTrigger('AI-BOOKING-MVP-6').dedupe).toBe(true);
  });
});
