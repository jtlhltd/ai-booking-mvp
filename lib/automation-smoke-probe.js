/**
 * Controlled automation smoke probe. Only reachable when AUTOMATION_SMOKE_ENABLED=true.
 * Keep this path safe; /heal-test remains available for armed self-heal failure tests.
 */
export function automationSmokeProbeMessage() {
  const payload = null;
  return payload?.message ?? 'automation smoke probe healthy';
}
