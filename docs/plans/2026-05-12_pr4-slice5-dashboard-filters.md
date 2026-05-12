# PR4 Slice 5: Unified Dashboard Filters

## Context

- Continue PR4 after slice 4 by adding the locked dashboard filter cohorts: `all`, `classic`, `sequence`, and `abandoned`.
- The predicate contract is already locked in the main PR4 plan: classic uses `classicFollowUpCutoverDate` when present, otherwise falls back to "no sequence artifact"; sequence excludes abandoned rows; abandoned is salvage-only.
- The current dashboard is split across `routes/follow-up-queue.js`, `routes/lead-handoff.js`, `routes/outbound-sequence-visibility-mount.js`, and `public/client-dashboard.html`.
- This slice should stay additive to the existing queue/dial/CRM path and avoid PR4.5 stop/dismiss behavior.

## Definition of done

- A shared server-side predicate helper classifies rows consistently for `all`, `classic`, `sequence`, and `abandoned`.
- `routes/follow-up-queue.js` and `routes/lead-handoff.js` accept the same dashboard cohort filter and apply it server-side.
- `routes/outbound-sequence-visibility-mount.js` accepts the same cohort filter for the recent list/runtime feed used by `#outboundSequenceWindow`.
- `public/client-dashboard.html` exposes a unified filter bar and sends the selected filter to both the follow-up list and sequence window.
- Targeted route/UI-contract tests pass, and `npm run test:ci` passes before commit.

## Non-goals

- No PR4.5 stop/dismiss actions, `_opsAudit`, or salvage dismissal state.
- No new import/API writing for `leads.lead_dial_context_json`.
- No redesign of the dashboard layout beyond the new filter wiring and copy needed for the cohort labels.

## Work breakdown

- [x] Add a shared helper for cohort normalization and classic/sequence/abandoned predicates.
- [x] Wire server-side filtering into `routes/follow-up-queue.js` and `routes/lead-handoff.js`.
- [x] Wire matching filter support into `routes/outbound-sequence-visibility-mount.js`.
- [x] Update `public/client-dashboard.html` to render and persist the unified filter state for both surfaces.
- [x] Add or update targeted route/client tests for the new filter contract.
- [x] Run targeted tests, then `npm run test:ci`.
- [x] Commit and push the slice.

## Risk & rollback

- Risk: the classic/sequence split could misclassify rows around the cutover date.
  Rollback: disable the new filter param handling and fall back to `all` while preserving the existing unfiltered lists.
- Risk: follow-up rows could disappear if server enrichment cannot match sheet phones to DB artifacts.
  Rollback: keep enrichment best-effort and default unmatched rows to the broadest safe cohort for the current contract.
