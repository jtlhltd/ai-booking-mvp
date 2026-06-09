# Automation Smoke Probe Safeguards

**Date**: 2026-06-09
**Issue**: AI-BOOKING-MVP-7

## Context

- The `/automation-smoke` endpoint contains an intentional null dereference to test Sentry error capture
- The endpoint was left enabled in deployed environments (`AUTOMATION_SMOKE_ENABLED=true`)
- No guard prevents repeated invocations, causing 23 repeated error events in live deployments
- The probe is designed for one-time validation, not continuous testing

## Definition of Done

1. The automation smoke probe executes at most once per instance lifetime
2. Subsequent calls return a cached result without throwing
3. Tests verify single-fire behavior
4. Documentation clarifies intended usage
5. The fix pattern can be reused for the similar `/heal-test` endpoint if needed

## Non-Goals

- Removing the smoke probe entirely (it's useful for validating Sentry setup)
- Changing the env var gate (still only enabled when explicitly set)
- Modifying the intentional error (it's the validation mechanism)

## Work Breakdown

- [x] Update `lib/automation-smoke-probe.js` to implement single-fire behavior with cached result
- [x] Add test coverage for single-fire behavior
- [x] Run existing tests to ensure no regressions
- [x] Commit and push changes

## Risk & Rollback

**Risks**:
- Low: Change is minimal and only affects a debug endpoint
- The endpoint is still gated by `AUTOMATION_SMOKE_ENABLED` env var

**Rollback**:
- Set `AUTOMATION_SMOKE_ENABLED=false` to disable the endpoint
- Revert the commit if unexpected behavior occurs
