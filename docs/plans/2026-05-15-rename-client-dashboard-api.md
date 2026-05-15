# Rename demo-dashboard API to client-dashboard

## Context

- Production Tom/outreach dashboard uses live Postgres data; "demo-dashboard" naming is misleading.
- HTML already lives at `client-dashboard.html`.

## Definition of done

- Canonical: `GET /api/client-dashboard/:clientKey`, `GET /api/client-dashboard-debug/:clientKey`
- Code: `routes/client-dashboard-data.js`, `lib/client-dashboard-response-cache.js`, matching handlers/tests
- Legacy `/api/demo-dashboard*` remains as deprecated alias (same handler + Deprecation header)
- Client + scripts call canonical path; `npm run test:ci` passes

## Non-goals

- Renaming `demo_client` tenant key or demo-mode product features
- Splitting `client-dashboard.html`

## Work breakdown

- [x] Rename modules + exports
- [x] Dual-mount routes + timeout/cache env aliases
- [x] Update client, mounts, tests, scripts
- [x] `npm run test:ci`

## Risk & rollback

- Old URLs keep working via alias until removed intentionally.
