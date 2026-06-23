# Sentry Self-Heal: AI-BOOKING-MVP-9

## Context

- Sentry issue `AI-BOOKING-MVP-9` is a live `fatal` error: `Connection terminated unexpectedly`.
- The culprit transaction is `GET /health/lb`; the event returned HTTP 200 but was captured as an uncaught exception from `pg`.
- The affected release is `6e26c5c3618edde2c5b43506d2d61da0e17ea705`; the issue has one occurrence and is unresolved.
- The suspected failure mode is an unhandled PG pool idle-client error event, not a request handler 5xx.

## Definition Of Done

- The app's primary PG pool handles unexpected pool `error` events without throwing an uncaught exception.
- A focused regression test proves emitting a pool `error` is handled by the pool listener.
- Required local checks pass: `npm run test:unit` and `npm run test:integration-lite`.
- If the fix remains GREEN risk, open a ready PR, wait for required CI jobs, merge, confirm Render deploy for the merged commit, verify `/health/lb` returns 200 three times, verify the culprit path no longer surfaces the original fatal mode, and resolve the Sentry issue through the relay.

## Non-Goals

- Do not change dialing, queue scheduling, tenant routing, or webhook trust behavior.
- Do not broaden database retry semantics or mask query failures that should make `/health/lb` return 503.
- Do not add new dependencies or change Render infrastructure.

## Work Breakdown

- [ ] Inspect the constrained health route and DB connection pool code.
- [ ] Add focused PG pool error handling for unexpected idle-client disconnects.
- [ ] Add a regression test around pool `error` listener behavior.
- [ ] Run `npm run test:unit` and `npm run test:integration-lite`.
- [ ] Commit, push to `cursor/sentry-self-heal-loop-3331`, and open a PR titled for `AI-BOOKING-MVP-9`.
- [ ] For GREEN risk, complete CI, merge, deploy confirmation, live verification, Sentry resolve, and Slack notification.

## Risk & Rollback

- Risk: swallowing pool errors could hide database instability. Mitigation: log the event and keep query failures unchanged so `/health/lb` still reports 503 when the DB is unavailable.
- Risk: changing core DB connection setup has broad runtime reach. Mitigation: only attach an event listener to the existing pool, with no query/retry/connection-limit behavior changes.
- Rollback: revert the pool listener commit; the previous behavior returns immediately, but unexpected idle-client disconnects may again become fatal uncaught exceptions.
