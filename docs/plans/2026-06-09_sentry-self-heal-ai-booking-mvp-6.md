# Sentry Self-Heal: AI-BOOKING-MVP-6

## Context

- Sentry automation trigger contained placeholder issue metadata, but the routed `ai-booking-mvp` project has actionable issue `AI-BOOKING-MVP-6`.
- Sentry reports 15 live error events for `GET /heal-test`, all failing in `lib/heal-test-probe.js` with `TypeError: Cannot read properties of null (reading 'message')`.
- The route is a gated self-heal test probe (`HEAL_TEST_ENABLED=true`) and not a dial, queue, tenant, billing, auth, migration, or scheduling surface.
- Seer analysis was attempted, but the Sentry API returned a communication error event; local stack frames match the repository code.

## Definition of Done

- `GET /heal-test` no longer throws when the probe is enabled and Sentry is configured.
- A focused regression test covers the enabled route returning a successful JSON response.
- Run `npm run test:unit` and `npm run test:integration-lite`; if either fails, stop before PR/ship and report.
- For GREEN risk, open a PR with the Sentry link, tier, root cause, tests, and merge recommendation.
- Verify health endpoint after deploy where tool permissions make shipping/deploy polling possible.

## Non-goals

- Do not change debug Sentry routes or skip-list behavior.
- Do not touch outbound dialing, queues, scheduling, tenant isolation, billing, auth, migrations, or behavioral intent rules.
- Do not add broad test infrastructure or unrelated refactors.

## Work Breakdown

- [ ] Confirm Sentry context, skip-list status, and risk tier.
- [ ] Update `lib/heal-test-probe.js` to safely read the optional probe message.
- [ ] Add a route regression test for enabled `/heal-test`.
- [ ] Run required unit and integration-lite tests.
- [ ] Commit, push, open PR, and perform allowed verification steps.

## Risk & Rollback

- Risk: returning `undefined` may omit the `message` field from JSON; tests should lock the intended response envelope.
- Risk: enabled probe depends on `SENTRY_DSN`; tests should set and restore relevant env vars.
- Rollback: revert the focused commit to restore the previous intentional throw if the self-heal probe needs to be re-triggered.

## Amendments

- During the required `npm run test:unit`, two unrelated tests failed because the cloud environment exposes alert configuration and one Jest mock was missing a current `db.js` export. Add test-only hardening so the required suite can run deterministically.
- During the required `npm run test:integration-lite`, two outbound-sequence visibility fixtures lacked the opt-in JSON now required for terminal rows to appear in the sequence-state list. Add fixture opt-in data only; do not change runtime filtering.
