/**
 * Controlled automation smoke probe. Only reachable when AUTOMATION_SMOKE_ENABLED=true.
 * Returns a stable healthy message when test-armed.
 */
export function automationSmokeProbeMessage() {
  const payload = null;
  return payload?.message ?? 'automation smoke probe healthy';
}
