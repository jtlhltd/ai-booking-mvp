# Sentry Automation Smoke Null Message

## Context

- Sentry issue `AI-BOOKING-MVP-7` reports `TypeError: Cannot read properties of null (reading 'message')` on deployed `GET /automation-smoke`.
- `/automation-smoke` is explicitly not a skip path when armed for testing.
- The first-party stack points to `lib/automation-smoke-probe.js` via `routes/health-probes-mount.js`.
- The repo already documents the intended local fix as optional chaining with a fallback in the smoke probe helper.

## Definition of done

- Armed `GET /automation-smoke` returns a 2xx JSON response instead of throwing.
- The route contract test covers the armed success behavior.
- `docs/INTENT.md` documents the operational behavior and names the enforcing test.
- Required local checks pass: `npm run test:unit`, `npm run test:integration-lite`, and `npm run test:ci`.
- Changes are committed, pushed to `cursor/full-self-heal-loop-d812`, opened as a PR, and shipped only if eligible.
- Deployed verification includes health checks, culprit path 2xx, and a Sentry quiet-period check before reporting completion.

## Non-goals

- Do not change `/debug-sentry` or `/debug-sentry-trace`; those remain debug-only Sentry emitters.
- Do not change `/heal-test`, which remains the separate self-heal test arm.
- Do not broaden Sentry SDK setup or alert configuration.
- Do not alter outbound dialing, queueing, tenant auth, or billing behavior.

## Work breakdown

- [ ] Confirm the Sentry stack frames match repository files.
- [ ] Update `automationSmokeProbeMessage()` to handle a null payload with a stable fallback message.
- [ ] Update route contract coverage for armed `/automation-smoke` success.
- [ ] Add an ops intent row documenting the smoke probe contract and its enforcement.
- [ ] Run required local test commands.
- [ ] Commit, push, open PR, and follow the GREEN shipping workflow where available.
- [ ] Verify deployed app behavior and report results.

## Risk & rollback

- Risk: Changing an intentionally broken smoke arm could reduce a test-only failure signal. Mitigation: `/heal-test` remains available for armed self-heal failure testing.
- Risk: The deployed env may not have `AUTOMATION_SMOKE_ENABLED=true`, in which case live culprit-path verification should expect `404 not_found` rather than 2xx. Mitigation: verify the current deployed behavior and report the actual state.
- Rollback: Revert the commit to restore the previous throwing probe and test expectation.

## Amendments

- 2026-06-09: Updated the target branch from the earlier self-heal branch name to this automation run's branch, `cursor/full-self-heal-loop-d812`.
