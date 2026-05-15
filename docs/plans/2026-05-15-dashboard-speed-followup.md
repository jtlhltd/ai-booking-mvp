# Dashboard speed follow-up (poll + cache + guardrail)

## Context

- Full speed pass shipped (`017d5fe`): parallel boot, real `brief=1`, staggered deferred panels.
- Remaining pain: 60s poll always hits full `demo-dashboard`; brief still runs heavy core SQL; no CI load-shape guard.

## Definition of done

- In-memory TTL cache (~10s) per `clientKey` for `GET /api/demo-dashboard` (respect `brief` as cache key).
- Poll supports `If-None-Match` / `304` when payload unchanged (etag from fingerprint fields).
- Client: backoff poll when tab visible but idle; use etag on poll; skip redundant fetches.
- Contract test: brief skips enrichment; etag returns 304 when unchanged.
- `npm run test:ci` passes.

## Non-goals

- New delta API route, Redis, split HTML file, dial/queue changes.

## Work breakdown

- [x] Server: demo-dashboard response cache + ETag
- [x] Client: poll etag + idle backoff
- [x] Tests: contract for cache/etag; outreach load-budget static guard
- [x] `npm run test:ci`

## Risk & rollback

- Env `DEMO_DASHBOARD_CACHE_MS=0` disables cache.
- Client: omit poll etag header to always get 200 body.
