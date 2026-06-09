/**
 * Controlled Sentry self-heal test probe. Only reachable when HEAL_TEST_ENABLED=true.
 * Safe optional read keeps the probe endpoint healthy after self-heal verification.
 */
export function healTestProbeMessage() {
  const payload = null;
  return payload?.message;
}
