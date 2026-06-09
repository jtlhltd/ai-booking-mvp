/**
 * Controlled automation smoke probe. Only reachable when AUTOMATION_SMOKE_ENABLED=true.
 * Returns a stable success message for the self-heal verification arm.
 */
export function automationSmokeProbeMessage() {
  const payload = null;
  return payload?.message ?? 'automation smoke probe healthy';
}
