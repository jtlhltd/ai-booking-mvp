# Sequence bulk / multi-select enrollment

## Context

- Per-lead enroll/unenroll exists on sequence detail and `POST .../enrollment`.
- Operators need to select multiple leads (sequence list + follow-up queue) and enroll/unenroll in one action.

## Definition of done

- `POST /api/clients/:clientKey/outbound-sequence/enrollment/bulk` with `leadPhones[]`, `enrolled`, per-phone results (cap 100).
- Sequence recent list: row checkboxes, select-all-visible, bulk enroll/unenroll.
- Follow-up queue: bulk enroll/unenroll for selected rows (by phone).
- Tests + INTENT amendment; `npm run test:ci` passes.

## Non-goals

- Filter-based “enroll entire cohort” without explicit selection; auto-queue on enroll.

## Work breakdown

- [x] Bulk lib + route
- [x] Sequence panel selection UI
- [x] Follow-up bulk buttons
- [x] Tests + CI

## Risk & rollback

- Large batches are sequential; cap 100. Revert commit to disable bulk route/UI.
