# Sentry self-heal: client dashboard N+1 DB connects

## Context

- Sentry issue `AI-BOOKING-MVP-B` is a real deployed-app performance issue: N+1 `pg-pool.connect` spans on `GET /api/client-dashboard/:clientKey`.
- The trigger path is `ai-booking-mvp` on the deployed app service and the route returned 200 while emitting repeated DB connection spans.
- The change should stay constrained to dashboard read behavior and avoid dialing, queue, tenant-routing, billing, or webhook behavior.
- Required self-heal flow includes tests, PR, merge for GREEN risk, Render deploy confirmation, health checks, culprit verification, and Sentry resolve relay.

## Definition of done

- The dashboard route reuses a single PG client for the request when a pool is available, reducing repeated per-query `pg-pool.connect` spans for `GET /api/client-dashboard/:clientKey`.
- Existing SQLite/injected-query behavior remains unchanged.
- Focused route contract coverage proves one pool checkout is used and released for a PG dashboard request.
- `npm run test:unit` and `npm run test:integration-lite` pass locally before PR.
- PR title/body reference `AI-BOOKING-MVP-B`, CI `test` and `test-windows` pass, GREEN PR is merged, Render deploy is live on the merged commit, health checks pass, culprit route is verified, and the issue is resolved through the relay.

## Non-goals

- Do not refactor dashboard SQL or change response shape beyond any incidental performance metadata already present.
- Do not touch dialing, queue processing, tenant isolation/auth, billing, or webhook signature behavior.
- Do not depend on Seer or placeholder Sentry metadata.

## Work breakdown

- [x] Confirm Sentry issue details and skip/dedupe conditions.
- [x] Add a per-request dashboard query runner using `pool.connect()` for PG and safe release in `finally`.
- [x] Wire deployed route dependencies to pass the PG pool if not already present.
- [x] Add focused contract test for single checkout/release and unchanged response success.
- [x] Run focused test, then `npm run test:unit`, then `npm run test:integration-lite`.
- [ ] Commit and push branch, open PR, mark ready.
- [ ] Wait for CI `test` and `test-windows`, merge GREEN PR, verify Render deploy and service health/culprit route, then resolve Sentry and send Slack completion.

## Risk & rollback

- Risk: sharing one client serializes dashboard queries that previously ran in parallel; rollback is reverting the route helper to the existing injected `query` calls.
- Risk: a thrown query could leak a client; mitigated by acquiring once and releasing in `finally`, covered by tests.
- Risk: missing `deps.pool` in the deployed service would make the change inert; verify route dependency wiring and fallback behavior.
