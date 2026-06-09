# Close gap: multi-call sequence usable in production

## Context

- Engine and operator UI exist; Tom (and other tenants) still lack a clear **go-live path** and **readiness signal**.
- Operators need to know: tenant config → enroll leads → queue dials → webhooks advance stages → handoff visible.

## Definition of done

- `GET /api/outbound-sequence/:clientKey/readiness` returns pass/fail/warn checks + next steps.
- Dashboard Sequence tab shows **Go live** checklist wired to that endpoint.
- `docs/SEQUENCE_GO_LIVE.md` documents operator steps (enroll, import opt-in, queueNow, rollback).
- `scripts/verify-sequence-readiness.mjs` prints checklist for a client key (CLI).
- In-sequence list filter (no unenrolled terminal rows) committed with tests.
- INTENT + tests; `npm run test:ci` passes.

## Non-goals

- In-dashboard JSON editor for stages; v2 backfill/voicemail/DNC.

## Work breakdown

- [ ] `lib/outbound-sequence-readiness.js` + unit tests
- [ ] Readiness route + dashboard panel
- [ ] `docs/SEQUENCE_GO_LIVE.md` + verify script
- [ ] INTENT + canary; commit list-include fix

## Risk & rollback

- Readiness is advisory only; disable via removing UI or ignoring endpoint.
