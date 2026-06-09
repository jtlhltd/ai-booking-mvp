/**
 * Controlled automation smoke probe. Only reachable when AUTOMATION_SMOKE_ENABLED=true.
 * 
 * Single-fire behavior: throws TypeError on first invocation to validate Sentry capture,
 * then caches the error and returns a success message on subsequent calls.
 * 
 * This prevents repeated error events from multiple invocations in live deployments.
 */

let hasBeenFired = false;
let cachedError = null;

export function automationSmokeProbeMessage() {
  if (hasBeenFired) {
    // Return cached result on subsequent calls
    return `smoke probe already fired (cached error: ${cachedError?.message || 'unknown'})`;
  }

  // First invocation: intentional null dereference to test Sentry
  hasBeenFired = true;
  try {
    const payload = null;
    return payload.message; // This throws TypeError
  } catch (err) {
    cachedError = err;
    throw err; // Re-throw so Sentry captures it
  }
}

/**
 * Reset the smoke probe state (for testing only)
 */
export function resetAutomationSmokeProbe() {
  hasBeenFired = false;
  cachedError = null;
}
