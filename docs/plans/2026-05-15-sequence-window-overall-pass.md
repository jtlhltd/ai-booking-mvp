# Sequence window overall pass

## Context

- Enrollment single/bulk exists; sequence panel still hides non-sequence-state leads and lacks queue visibility, bulk stop, and operator-oriented empty states.
- User asked for an overall pass on the sequence section (not one tiny feature).

## Definition of done

- Summary shows multi-call enrolled / not enrolled lead counts (tenant).
- List supports **Multi-call enrolled** and **Not enrolled** views (enrollable leads from `leads`).
- Rows show pending `sequence_next` queue hint and stuck/active warnings where applicable.
- Bulk **stop** for selected rows; optional **Queue first dial** on enroll/bulk (operator flag).
- Enrollment writes audit scalars (`sequenceEnrollmentAt`, `sequenceEnrollmentBy`).
- Tenant banner when sequence disabled or kill switch on; improved empty states.
- INTENT + tests; `npm run test:ci` passes.

## Non-goals

- Full leads-tab redesign; config JSON editor; filter-based enroll-all without selection.

## Work breakdown

- [x] API: summary counts, enrollable leads, pending queue map
- [x] API: bulk stop; enroll audit + optional queue first stage
- [x] UI: filters, banner, row badges, bulk stop, queue checkbox, empty states
- [x] INTENT + tests + CI

## Risk & rollback

- `queueNow` only enqueues when explicitly requested; revert commit to disable.

## Amendments

- **2026-05-15**: `/outbound-sequence/:clientKey/leads` listed every `lead_sequence_state` row, so **stopped/abandoned rows still appeared after unenroll** (`sequenceOptedIn: false`). Filter: show row only if opted in or `status=active` (`lib/outbound-sequence-state-list-include.js`).
