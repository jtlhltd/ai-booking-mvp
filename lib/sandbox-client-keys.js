/**
 * Optional sandbox / preview tenant keys (sample dashboard data, not production clients).
 * Live tenants (e.g. logistics outreach) never match these keys.
 */

export const SANDBOX_CLIENT_KEY = 'sandbox_client';

/** URL ?client= values that resolve to {@link SANDBOX_CLIENT_KEY}. */
export const SANDBOX_CLIENT_ALIASES = new Set([
  'sandbox',
  'sandbox_client',
  'sandbox-client',
  'demo',
  'demo_client',
  'demo-client',
  'preview',
  'preview_client'
]);

export function normalizeClientKeyParam(key) {
  if (key == null) return '';
  return String(key).trim();
}

export function isSandboxClientKey(key) {
  const k = normalizeClientKeyParam(key).toLowerCase();
  if (!k) return false;
  return k === SANDBOX_CLIENT_KEY || SANDBOX_CLIENT_ALIASES.has(k);
}

/** Map legacy ?client= spellings to the canonical sandbox key. */
export function resolveSandboxClientKey(key) {
  const k = normalizeClientKeyParam(key);
  if (!k) return SANDBOX_CLIENT_KEY;
  return isSandboxClientKey(k) ? SANDBOX_CLIENT_KEY : k;
}

export function isSandboxTenant(client) {
  if (!client) return false;
  const clientKey = String(client.clientKey || client.key || '').trim();
  if (isSandboxClientKey(clientKey)) return true;
  if (client.isSandbox === true || client.sandbox === true) return true;
  if (client.isDemo === true || client.demo === true) return true;
  if (clientKey.startsWith('demo-') || clientKey.includes('-demo')) return true;
  return false;
}

/** @deprecated use isSandboxTenant */
export function isDemoClient(client) {
  return isSandboxTenant(client);
}
