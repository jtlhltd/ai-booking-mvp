# Dashboard cleanup final pass

## Context

- Live tenants use `/api/client-dashboard` + `sandbox_client` preview naming shipped.
- Remaining: demo scripts/DB keys, call-quality round trip, sandbox UI copy, dead imports, load guardrail.

## Definition of done

- Preview tenant canonical `sandbox_client` in scripts; `demo-client`/`demo_client` remain aliases.
- Brief/full `client-dashboard` includes 7d call-quality fields; client uses them before `/api/call-quality`.
- Sandbox UI uses `(sample)` not `(demo)`; dead `server.js` imports removed.
- Static + contract guard for outreach load shape; `npm run test:ci` passes.

## Non-goals

- Split `client-dashboard.html`; remove legacy `/api/demo-dashboard` alias.

## Work breakdown

- [x] Call-quality embed + client consume
- [x] Scripts + sandbox copy + server.js cleanup
- [x] Test-call route rename with alias
- [x] Load-shape guard test
- [x] `npm run test:ci`
