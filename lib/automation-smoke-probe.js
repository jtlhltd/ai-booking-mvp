/**
 * Controlled automation smoke probe. Only reachable when AUTOMATION_SMOKE_ENABLED=true.
 * Intentional null deref when test-armed — fix is optional chaining in this file.
 */
export function automationSmokeProbeMessage() {
  const payload = null;
  return payload.message;
}
