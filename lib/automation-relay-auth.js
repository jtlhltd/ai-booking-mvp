export function automationRelaySecretMatches(req) {
  const expected =
    process.env.CURSOR_AUTOMATION_RELAY_SECRET ||
    process.env.SENTRY_SELF_HEAL_RELAY_SECRET;
  if (!expected) return true;
  const provided =
    req.get('x-cursor-automation-relay-secret') ||
    req.get('x-sentry-self-heal-secret') ||
    req.get('x-webhook-secret') ||
    req.query?.secret;
  return provided === expected;
}
