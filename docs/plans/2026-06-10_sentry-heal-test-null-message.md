# Sentry Heal Test Null Message

## Context

- Sentry issue `AI-BOOKING-MVP-6` reports a null-message dereference on deployed `GET /heal-test`.
- The real Sentry issue is level `error`, unresolved/regressed, and points to `lib/heal-test-probe.js` via `routes/health-probes-mount.js`.
- `/heal-test` is explicitly not a skip path when armed for self-heal testing.
- The fix is a small GREEN-tier route-helper change, but the route contract and ops intent must move with it.

## Definition of done

- Armed `GET /heal-test` returns a 2xx JSON success response instead of throwing.
- Route contract coverage asserts armed `/heal-test` success and existing disabled behavior.
- `docs/INTENT.md` documents the operational behavior and names the enforcing route contract.
- Required local checks pass: `npm run test:unit`, `npm run test:integration-lite`, and `npm run test:ci`.
- Changes are committed and pushed to `cursor/full-self-heal-loop-dd10`.
- PR/deploy verification is attempted according to the automation workflow, with health checks, culprit-path verification, and Sentry quiet-period checks before resolution.

## Non-goals

- Do not change `/debug-sentry` or `/debug-sentry-trace`; those remain debug-only Sentry emitters.
- Do not alter outbound dialing, queueing, tenant auth, or billing behavior.
- Do not broaden Sentry SDK setup or alert configuration.
- Do not embed Sentry event payload data in source or tests.

## Work breakdown

- [ ] Confirm Sentry stack frames match repository files.
- [ ] Update `healTestProbeMessage()` to handle a null payload with a stable fallback message.
- [ ] Update route contract coverage for armed `/heal-test` success.
- [ ] Update the ops intent contract to match the healed `/heal-test` behavior.
- [ ] Run required local test commands.
- [ ] Commit and push the branch.
- [ ] Open/ready PR where available, wait for CI, ship GREEN if permitted, poll Render deploy, verify the live service, check Sentry quiet period, and resolve only after verification.

## Risk & rollback

- Risk: Changing the armed heal-test probe removes a deliberate deployed error source used for self-heal testing. Mitigation: this is exactly the current Sentry issue being healed; debug-only emitters remain unchanged.
- Risk: Live verification may depend on `HEAL_TEST_ENABLED=true` and Sentry being configured on the service. Mitigation: verify current deployed behavior and report exact results if environment gating prevents 2xx.
- Rollback: Revert the commit to restore the previous throwing probe and route contract expectation.
