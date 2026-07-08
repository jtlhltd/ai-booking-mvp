# Sentry self-heal: dashboard pool connect error envelope

## Context

- Sentry issue `AI-BOOKING-MVP-E` is a real production error on `GET /api/client-dashboard/:clientKey`. <!-- pragma: allowlist secret -->
- The failing stack frame is `routes/client-dashboard-data.js#withClientDashboardQueryRunner`, where `pool.connect()` rejects with `Connection terminated unexpectedly`.
- Existing dashboard query errors are returned as JSON envelopes, but request-scoped PG client acquisition happens before that handler `try/catch`.
- The change should stay constrained to dashboard read error containment; it must not alter dialing, queueing, tenant routing, billing, or webhook behavior.

## Definition of done

- `pool.connect()` failures for the dashboard data route return a JSON 500 envelope instead of escaping as an unhandled async route rejection.
- The successful request-scoped PG client path still uses one pool checkout and always releases the client after query work.
- Focused contract coverage reproduces the connect failure and proves the response envelope.
- Required self-heal tests pass locally before PR:
  - `npm run test:unit`
  - `npm run test:integration-lite`
- GREEN self-heal path is completed: commit, push, PR ready, CI `test` + `test-windows`, merge, Render deploy confirmation, prod health checks, culprit route verification, Sentry resolve relay, Slack completion.

## Non-goals

- Do not change dashboard payload shape for successful responses.
- Do not refactor dashboard SQL or alter response caching behavior.
- Do not touch tenant authorization/isolation, outbound dialing, queue workers, billing gates, or webhook signature behavior.
- Do not depend on Seer or manually fire duplicate self-heal webhooks.

## Work breakdown

- [ ] Confirm Sentry details and skip/dedupe conditions.
- [ ] Move dashboard data route error containment so request-scoped PG connection acquisition failures are handled.
- [ ] Add/adjust route contract coverage for `pool.connect()` rejection.
- [ ] Run focused route contract test.
- [ ] Commit and push implementation before broad testing.
- [ ] Run `npm run test:unit` and `npm run test:integration-lite`.
- [ ] Open/ready PR and proceed through GREEN deploy verification before resolving Sentry.

## Risk & rollback

- Risk: broadening the catch around connection acquisition could duplicate the existing dashboard operator alert path. Mitigation: reuse the same handler error response path rather than adding a second route-level wrapper.
- Risk: hiding transient DB connection failures behind a 500 might mask availability issues. Mitigation: the route still logs and alerts, and `/health/lb` remains the deploy health source for database availability.
- Rollback: revert the route/test commit; dashboard route returns to the previous behavior where connect failures escape the async handler.
