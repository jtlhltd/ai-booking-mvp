/**
 * Controlled Sentry self-heal test probe. Only reachable when HEAL_TEST_ENABLED=true.
 * Intentional null deref — fix is optional chaining on `payload?.message`.
 */
export function healTestProbeMessage() {
  const payload = null;
  return payload?.message;
}
