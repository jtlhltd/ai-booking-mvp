# Finish dashboard “demo” → sandbox naming

## Context

- Live tenants (Tom) use `/api/client-dashboard`; remaining “demo” labels mean optional sandbox tenant only.
- Canonical sandbox key: `sandbox_client` (URL aliases: `demo_client`, `demo-client`, `demo`, `sandbox`).

## Definition of done

- Shared `lib/sandbox-client-keys.js`; routes/helpers use it.
- `client-dashboard.html` uses SANDBOX_* names; seed data only for sandbox key.
- `isDemoClient` → `isSandboxTenant` (legacy alias kept one release if needed).
- Tests + setup links updated; `npm run test:ci` passes.

## Non-goals

- Renaming `scripts/create-demo-client.js` or DB rows for existing `demo-client` tenant.
