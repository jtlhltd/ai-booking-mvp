# PR4.5: Sequence Stop And Salvage Dismiss

## Context

- The remaining non-optional PR4 scope is the locked PR4.5 slice: admin-only stop for active sequences and dismiss for abandoned salvage rows.
- The route family already exists in `routes/client-ops-mount.js` for privileged dashboard mutations, and the dashboard already has sequence/follow-up surfaces to attach controls to.
- Audit must be append-only in `qual._opsAudit` with a FIFO cap of 32 entries.
- Dismissed salvage rows must leave the default abandoned/salvage cohort while remaining visible in `all`.

## Definition of done

- Admin-only API endpoints exist for stopping a lead's sequence and dismissing an abandoned salvage row.
- Stop cancels future `sequence_next` queue rows for the lead and prevents further automatic sequence dialing by updating sequence state safely.
- Dismiss stamps `qual._salvageDismissedAt` / `qual._salvageDismissedBy` and appends an audit entry.
- Both stop and dismiss append bounded `qual._opsAudit` entries.
- Dashboard UI exposes the controls and refreshes the sequence/follow-up views after success.
- `docs/INTENT.md` is updated and at least one canary enforces the new behavior.
- Targeted tests and `npm run test:ci` pass, then the changes are committed and pushed.

## Non-goals

- No new auth model beyond the existing operator API-key pattern.
- No import/API population for `lead_dial_context_json`.
- No separate audit table or background worker for stop/dismiss.

## Work breakdown

- [x] Add shared helper(s) for bounded ops audit append, sequence stop, and salvage dismiss mutations.
- [x] Extend privileged client-ops routes and API wiring for the new endpoints.
- [x] Update dashboard cohort logic so dismissed salvage leaves the abandoned filter but remains in `all`.
- [x] Add dashboard controls for stop and dismiss using the existing operator API-key pattern.
- [x] Update `docs/INTENT.md` and add a canary for stop/dismiss behavior.
- [x] Add targeted unit/route coverage.
- [x] Run targeted tests, then `npm run test:ci`.
- [x] Commit and push.

## Risk & rollback

- Risk: a stop action cancels the wrong queue rows or leaves active sequence state behind.
  Rollback: disable the new stop endpoint/UI and revert to read-only visibility while preserving existing sequence state.
- Risk: dismissed salvage rows disappear from all cohorts instead of just abandoned.
  Rollback: ignore `_salvageDismissedAt` in cohort filtering until the route/UI fix is ready.

## Amendments

- Local `npm run test:ci` failed in the repo-wide `test:coverage` lane because Jest cache writes hit a disk-full condition. Add `--no-cache` to the heavy Jest scripts (`test:coverage`, `test:detect-leaks`) so the mandated full CI run stays reliable on this workspace while preserving the same test surface.
