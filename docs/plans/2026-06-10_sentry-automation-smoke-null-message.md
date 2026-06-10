# Sentry Automation Smoke Null Message

## Context

- Sentry issue `AI-BOOKING-MVP-7` is a real deployed error for `GET /automation-smoke`, not a skipped test notification.
- The first-party stack points to `lib/automation-smoke-probe.js` returning `payload.message` while `payload` is `null`.
- `docs/INTENT.md` already declares `ops.automation-smoke-healthy-when-armed`: an armed smoke probe should return a healthy JSON response instead of throwing.
- This is a GREEN-tier probe/helper fix scoped away from dialing, queueing, tenant routing, billing, and webhook signature behavior.

## Definition of done

- `automationSmokeProbeMessage()` returns the stable fallback message `automation smoke probe healthy` when payload is nullish.
- The route contract test covers armed `/automation-smoke` success and is tied to `ops.automation-smoke-healthy-when-armed`.
- Required local checks pass: `npm run test:unit`, `npm run test:integration-lite`, and `npm run test:ci`.
- Changes are committed and pushed to `cursor/sentry-issue-self-healing-d130`.
- A PR is opened and marked ready.
- For GREEN shipping: CI `test` and `test-windows` pass, the PR is merged, Render deploy is live, `/health/lb` returns 200 three times, `/automation-smoke` returns either expected disabled 404 or healthy 200, and the Sentry issue is resolved only after verification.

## Non-goals

- Do not change `/debug-sentry` or `/debug-sentry-trace`.
- Do not change `/heal-test`.
- Do not broaden Sentry SDK setup or alert configuration.
- Do not alter outbound dialing, queueing, tenant auth, billing behavior, or webhook signature behavior.

## Work breakdown

- [ ] Confirm Sentry issue details and skip/dedupe state.
- [ ] Update `lib/automation-smoke-probe.js` to use optional chaining plus fallback message.
- [ ] Update `tests/routes/health-probes-mount.contract.test.js` to assert armed success for `/automation-smoke`.
- [ ] Run local required test commands.
- [ ] Commit, push, open PR, and mark it ready.
- [ ] If CI and risk tier allow, merge, wait for Render deploy, verify prod, resolve Sentry, and report to Slack.

## Risk & rollback

- Risk: The smoke probe no longer intentionally throws when armed. Mitigation: this matches the existing `ops.automation-smoke-healthy-when-armed` intent row; `/debug-sentry` and `/debug-sentry-trace` remain explicit debug emitters.
- Risk: The deployed environment may have `AUTOMATION_SMOKE_ENABLED=false`; in that case, deployed culprit verification should treat `404 { error: "not_found" }` as pass per the self-heal contract.
- Rollback: Revert the probe/test commit to restore the prior throwing behavior.
