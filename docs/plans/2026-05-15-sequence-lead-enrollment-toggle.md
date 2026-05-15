# Sequence lead enrollment toggle (opt in / out)

## Context

- Multi-call outbound requires per-lead opt-in in `leads.lead_dial_context_json` (`outboundSequenceOptIn`, etc.).
- Import path already supports opt-in columns; operators cannot change enrollment on existing leads from the dashboard.
- Stopping an active sequence does not clear opt-in flags.

## Definition of done

- `POST /api/clients/:clientKey/outbound-sequence/enrollment` sets `outboundSequenceOptIn` true/false (operator API key).
- Opt-out stops any active sequence for that lead (same as stop endpoint behavior).
- Sequence visibility rows expose `sequenceOptedIn`.
- Dashboard sequence detail panel has enroll / unenroll actions.
- Intent row + canary + contract tests; `npm run test:ci` passes.

## Non-goals

- Bulk enroll all leads; auto-queue first stage on enroll; leads portal PUT changes.

## Work breakdown

- [x] `lib/outbound-sequence-enrollment.js` + dial-context merge helper
- [x] Route on `client-ops-mount.js`
- [x] Visibility API `sequenceOptedIn`
- [x] Dashboard buttons + refresh
- [x] INTENT + policy allowlist + tests + `npm run test:ci`

## Risk & rollback

- Re-enrolling after stop may queue classic until next import/queue pass — document; do not auto-dial on toggle unless requested later.
- Rollback: revert commit; enrollment flags remain in DB (manual SQL if needed).
