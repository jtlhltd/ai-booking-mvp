/**
 * Stubs for dashboard tenant routes that use DB-backed API keys in production.
 * Sets req.clientKey from the same sources as requireTenantAccessOrAdmin (params/query/body).
 */
export function createDashboardRouteAuthStubs() {
  function authenticateApiKey(req, res, next) {
    const ckRaw = req.params?.clientKey ?? req.query?.clientKey ?? req.body?.clientKey;
    const ck = ckRaw != null && String(ckRaw).trim() !== '' ? String(ckRaw).trim() : '';
    req.apiKey = { id: 1, permissions: [], client_key: ck };
    req.clientKey = ck;
    next();
  }
  return { authenticateApiKey };
}
