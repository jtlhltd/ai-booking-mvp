# Sentry dashboard pool live binding self-heal

## Context

- Sentry issue `AI-BOOKING-MVP-B` is an unresolved/regressed repeated database access performance issue on `GET /api/client-dashboard/:clientKey`.
- A previous fix added a single request-scoped `pool.connect()` path, but prod still reported repeated `pg-pool.connect` spans on the same release.
- `mountApi(...)` runs before `initDb()`, so route deps captured `pool` while it was still `null`; the dashboard route therefore fell back to global `query()` and kept acquiring a pool connection per query.
- The change is scoped to API dependency wiring and the client dashboard data route. It does not alter dialing, queueing, billing, or webhook behavior.

## Definition of done

- `GET /api/client-dashboard/:clientKey?brief=1` uses the initialized live SQL pool even when route deps were built before `initDb()`.
- A regression test proves the route uses one request-scoped pool client via a lazy pool getter and does not call fallback `query()`.
- Required pre-PR tests pass:
  - `npm run test:unit`
  - `npm run test:integration-lite`
- GREEN self-heal path is completed: commit, push, PR ready, CI `test` + `test-windows`, merge, Render deploy confirmation, prod health checks, culprit path verification, Sentry resolve relay, Slack completion.

## Non-goals

- Do not rewrite the dashboard SQL payload or change dashboard response semantics.
- Do not modify tenant authorization/isolation, dialing, queue workers, billing gates, or webhook signature behavior.
- Do not depend on Seer or manually fire additional self-heal webhooks.

## Work breakdown

- [ ] Add a lazy live DB pool dependency through `buildApiDeps(...)` / `mountApi(...)`.
- [ ] Teach the dashboard request query runner to use `deps.getPool()` when `deps.pool` is not yet initialized.
- [ ] Add/adjust route contract coverage for the before-init dependency capture scenario.
- [ ] Run focused tests, then required unit and integration-lite suites.
- [ ] Commit and push the implementation before deploy/verification workflow.
- [ ] Open/ready PR and proceed through GREEN deploy verification before resolving Sentry.

## Risk & rollback

- Risk: a bad live-pool getter could throw and break dashboard reads. Mitigation: optional function check and existing fallback query path when no live pool exists.
- Risk: using one client for concurrent dashboard reads could serialize work; this is already the intended previous fix and is safer than repeated pool acquisitions under Render connection pressure.
- Rollback: revert the PR commit; dashboard route falls back to existing global `query()` behavior.
