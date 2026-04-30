## PR plan: Secure `routes/clients-api.js` (auth + tenant isolation)

### Why
`routes/clients-api.js` appears to expose `/api/clients` and `/api/clients/:key` without authentication. This likely violates:
- `tenant.auth-required-on-admin`
- `tenant.cross-tenant-isolation`

It can also leak tenant configuration in responses and logs.

### Scope
- **Code**: `routes/clients-api.js`, `middleware/security.js` (tenant param handling)
- **Tests**: `tests/routes/batch2-routes.contract.test.js` and/or a new focused contract file
- **Intent/enforcement**: tie changes to `tenant.auth-required-on-admin` and `tenant.cross-tenant-isolation`

### Proposed changes

1) **Require API key auth for the router**
- Apply `authenticateApiKey` to all handlers in `routes/clients-api.js`, either:\n
  - at router-level (`router.use(authenticateApiKey)`), or\n
  - per-route for explicitness.

2) **Enforce tenant isolation correctly**
- Fix `requireTenantAccess` in `middleware/security.js` to accept `req.params.clientKey` (and/or a configurable param name), not only `req.params.tenantKey`.\n
  - e.g. `const requestedTenant = req.params.tenantKey || req.params.clientKey || req.body.clientKey || req.query.clientKey;`

3) **Reduce sensitive logs**
- Remove or gate `console.log` lines that echo tenant keys and object key lists in production.

### Acceptance criteria
- Without `X-API-Key`, `GET /api/clients/:key` returns **401**.
- With an API key for tenant A, `GET /api/clients/tenantB` returns **403**.
- With an API key for tenant A, `GET /api/clients/tenantA` returns **200**.
- Response bodies do not leak internal tenant keys (use `assertNoTenantKeyLeak` where applicable).

### Tests / gates to add
- Add/extend contract tests for `routes/clients-api.js`:\n
  - `assertAuthRequired(app, { method:'get', path:'/api/clients/c1' })`\n
  - `assertTenantIsolation(...)` with tenant mismatch\n
  - a happy-path with valid auth

### Rollout / verification
- Confirm client dashboards that rely on this endpoint still function (if any are public/self-service, explicitly scope exceptions).\n
- Confirm `npm run test:ci` remains green.

