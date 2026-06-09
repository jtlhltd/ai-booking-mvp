## Context

- Sentry issue `AI-BOOKING-MVP-6` reports `TypeError: Cannot read properties of null (reading 'message')`.
- The failing route is `GET /heal-test` in the live app, with the first-party frame in `lib/heal-test-probe.js`.
- The issue has 25 live error events and high actionability, so it is not a skip case.
- The affected code is an opt-in Sentry self-heal probe, not a behavioral/billing-affecting dial, queue, tenant, billing, scheduling, auth, or migration surface.

## Definition of Done

- `GET /heal-test` no longer throws when the probe payload is null.
- Existing route behavior remains unchanged when `HEAL_TEST_ENABLED` or Sentry are disabled.
- Local verification passes:
  - `npm run test:unit`
  - `npm run test:integration-lite`
- A PR is opened for the fix, marked ready, and the self-heal workflow proceeds only if the configured green gates pass.

## Non-goals

- Do not change Sentry debug-test routes (`/debug-sentry`, `/debug-sentry-trace`).
- Do not modify outbound dialing, queues, tenant isolation, billing, scheduling, auth, or migrations.
- Do not broaden the `/heal-test` feature beyond preventing the known null dereference.

## Work Breakdown

- [x] Confirm Sentry context and duplicate PR status.
- [x] Inspect the failing probe and related route tests.
- [x] Patch `healTestProbeMessage()` with a minimal null-safe message read.
- [x] Add or update focused tests for the fixed `/heal-test` path.
- [ ] Run required local tests.
- [ ] Commit, push, open/ready PR, then follow green-only ship and verification gates as tooling allows.

## Risk & Rollback

- Risk: returning an unexpected empty value from `/heal-test` could weaken the self-heal probe signal.
- Mitigation: use the existing inline intent (`payload?.message`) and assert a successful JSON response so the probe remains explicit.
- Rollback: revert the commit to restore the previous intentional throwing behavior if the probe is no longer needed.
