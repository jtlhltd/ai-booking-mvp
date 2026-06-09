/**
 * Controlled automation smoke probe. Only reachable when AUTOMATION_SMOKE_ENABLED=true.
 * Intentional null deref — fix is optional chaining with fallback in this file.
 */
export function automationSmokeProbeMessage() {
  const payload = null;
  return payload.message;
}
