# Sentry Self-Heal: AI-BOOKING-MVP-6

## Context

- Sentry issue `AI-BOOKING-MVP-6` is a live `TypeError: Cannot read properties of null (reading 'message')`.
- The real issue data points to `GET /heal-test` and `lib/heal-test-probe.js#healTestProbeMessage`.
- `/heal-test` is gated by `HEAL_TEST_ENABLED=true` and Sentry configuration; the automation instructions explicitly say not to skip it when armed.
- This is a GREEN route/probe helper fix, not a dialing, queueing, tenant, billing, or scheduling change.

## Definition of Done

- `GET /heal-test` returns a 2xx JSON success envelope when armed and Sentry is configured.
- Route contract coverage asserts the armed `/heal-test` success response.
- `docs/INTENT.md` reflects the live self-heal behavior and the route contract enforcement.
- Required tests pass locally before PR: `npm run test:unit` and `npm run test:integration-lite`.
- Open a PR titled `fix(sentry): <short description> (AI-BOOKING-MVP-6)`, mark it ready, wait for CI `test` and `test-windows`, merge GREEN, poll Render deploy, verify live health and culprit path, then resolve Sentry only after quiet verification.

## Non-goals

- Do not change `/debug-sentry` or `/debug-sentry-trace` skip behavior.
- Do not touch outbound dialing, queues, retries, lead import, tenant isolation, billing, or sequence behavior.
- Do not add broad test infrastructure or unrelated refactors.

## Work Breakdown

- [ ] Update `healTestProbeMessage()` to safely read an optional message with a stable fallback.
- [ ] Update the `/heal-test` route contract from expected 500 to expected 200 JSON.
- [ ] Update `docs/INTENT.md` so the ops probe contract matches the healed route behavior.
- [ ] Commit and push the focused fix before running required tests.
- [ ] Run `npm run test:unit` and `npm run test:integration-lite`; fix any regressions caused by this change.
- [ ] Open and ready the PR, wait for required CI, merge GREEN, poll Render, verify the deployed app, check Sentry quiet period, resolve, and Slack the result.

## Risk & Rollback

- Risk: losing an intentional failure probe could affect self-heal demonstrations. Mitigation: keep the route gated and only make the armed route return the stable success envelope expected by this automation.
- Risk: stale docs/tests could still describe `/heal-test` as a broken probe. Mitigation: update both the intent contract and route test in the same change.
- Rollback: revert the focused commit if `/heal-test` must intentionally throw again for a separate controlled test workflow.
