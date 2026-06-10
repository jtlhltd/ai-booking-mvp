/**
 * Controlled Sentry self-heal test probe. Only reachable when HEAL_TEST_ENABLED=true.
 * Returns a stable success message for the self-heal verification arm.
 */
export function healTestProbeMessage() {
  const payload = null;
  return payload?.message ?? 'heal test probe healthy';
}
