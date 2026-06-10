# Sentry Heal Test Null Message

## Context

- Sentry issue `AI-BOOKING-MVP-6` reports a null message `TypeError` on the deployed `GET /heal-test` probe.
- The first-party stack points to `lib/heal-test-probe.js` via `routes/health-probes-mount.js`.
- `/heal-test` is explicitly not a skip path when armed for self-heal testing.
- Existing `/automation-smoke` behavior uses optional chaining with a stable success message and provides the local pattern to mirror.

## Definition of done

- Armed `GET /heal-test` returns a 2xx JSON response instead of throwing.
- Route contract coverage proves the armed `/heal-test` success behavior.
- `docs/INTENT.md` no longer describes `/heal-test` as an intentional failure probe and documents its enforced operational behavior.
- Required local checks pass: `npm run test:unit`, `npm run test:integration-lite`, and `npm run test:ci`.
- Changes are committed, pushed to `cursor/full-self-heal-loop-c7b2`, opened as a PR, and shipped only if eligible.
- Deployed verification includes health checks, culprit path 2xx, and a Sentry quiet-period check before reporting completion.

## Non-goals

- Do not change `/debug-sentry` or `/debug-sentry-trace`; those remain debug-only Sentry emitters and are skipped by automation.
- Do not broaden Sentry SDK setup or alert configuration.
- Do not alter outbound dialing, queueing, tenant auth, or billing behavior.

## Work breakdown

- [ ] Confirm the Sentry stack frames match repository files.
- [ ] Update `healTestProbeMessage()` to handle a null payload with a stable fallback message.
- [ ] Update route contract coverage for armed `/heal-test` success.
- [ ] Update the ops intent row for the self-heal probes and its enforcement.
- [ ] Run required local test commands.
- [ ] Commit, push, open PR, and follow the GREEN shipping workflow where available.
- [ ] Verify deployed app behavior and report results.

## Risk & rollback

- Risk: Changing an intentionally broken heal-test arm could reduce a test-only failure signal. Mitigation: `/debug-sentry` remains the explicit debug error endpoint and is excluded from self-heal shipping.
- Risk: The deployed env may not have `HEAL_TEST_ENABLED=true`, in which case live culprit-path verification may return `404 not_found` instead of 2xx. Mitigation: verify the current deployed behavior and report the actual state.
- Rollback: Revert the commit to restore the previous throwing probe and test expectation.
