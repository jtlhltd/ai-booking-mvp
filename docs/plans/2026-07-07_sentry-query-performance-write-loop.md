# Sentry self-heal: query performance metric write loop

## Context

- Sentry issue `AI-BOOKING-MVP-D` is a real deployed-app performance issue on `GET /api/client-dashboard/:clientKey`.
- Sentry identifies repeated `query_performance` upserts and `pg-pool.connect` spans during a successful dashboard request.
- The issue is in observability/performance tracking, not the dashboard response contract itself.
- The change should remain isolated from dialing, queues, tenant routing, billing, and webhook behavior.

## Definition of done

- Query performance metric upserts do not re-enter the tracked `db.query` wrapper and therefore do not produce recursive/extra performance spans.
- Existing behavior for recording slow generic queries remains intact.
- Focused unit coverage proves tracker metric writes use an untracked path when available and fall back safely otherwise.
- `npm run test:unit` and `npm run test:integration-lite` pass locally before PR.
- For GREEN risk: PR references `AI-BOOKING-MVP-D`, CI `test` and `test-windows` pass, PR is merged, Render deploy is live on the merged commit, health checks pass, culprit route verification passes, and the Sentry issue is resolved through the relay.

## Non-goals

- Do not rewrite dashboard SQL or change `/api/client-dashboard/:clientKey` response shape.
- Do not change the slow-query alert thresholds or email throttling policy.
- Do not touch dialing, queue processing, tenant isolation/auth, billing, or webhook signature behavior.
- Do not depend on Seer or placeholder Sentry metadata.

## Work breakdown

- [x] Confirm real Sentry issue details and skip/dedupe conditions.
- [ ] Add an untracked query path for query performance metric upserts.
- [ ] Update query performance tracker tests for the untracked metric write path and fallback behavior.
- [ ] Run focused tests, then `npm run test:unit`, then `npm run test:integration-lite`.
- [ ] Commit and push branch, open PR, mark ready.
- [ ] Wait for CI `test` and `test-windows`, merge GREEN PR, verify Render deploy and service health/culprit route, then resolve Sentry and send Slack completion.

## Risk & rollback

- Risk: direct pool metric writes could bypass the existing query concurrency limiter; the write is low-volume per tracked slow query and rollback is reverting the tracker helper to `query(...)`.
- Risk: non-primary-SQL tests or local modes may not have a pool; fallback to existing `query(...)` preserves those environments.
- Risk: Sentry may continue to report old events until deploy completes; verify by matching Render deploy commit and checking the culprit route after deploy.
