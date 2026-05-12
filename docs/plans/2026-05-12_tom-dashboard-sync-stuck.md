# Context
- Tom's live dashboard at `client-dashboard.html?client=d2d-xpress-tom` is stuck on the loading/syncing state.
- Runtime reproduction shows a fatal browser syntax error before any `/api` dashboard requests begin.
- The offending code is in `public/client-dashboard.html`, in the follow-up queue click handling path for outbound-sequence actions.
- Goal is to restore dashboard hydration with the smallest safe client-side fix and verify the live-facing behavior locally.

# Definition of done
- `public/client-dashboard.html` no longer contains the syntax error that prevents the dashboard script from parsing.
- The affected click handler still supports the same async salvage-dismiss behavior.
- A targeted verification confirms the dashboard page can execute its initial data load path again.
- Any lints introduced in edited files are checked and resolved if straightforward.

# Non-goals
- No redesign of Tom's dashboard UX.
- No refactor of unrelated dashboard async flows.
- No backend outbound-sequence behavior changes.

# Work breakdown
- [x] Inspect the surrounding dashboard click-handler code and identify the smallest correct async fix.
- [x] Patch `public/client-dashboard.html` to remove the parse-time syntax error without changing intended behavior.
- [x] Run a targeted verification for the dashboard page / affected code path.
- [x] Check lints for touched files and fix any newly introduced issues if needed.

# Risk & rollback
- Risk: changing the event handler signature could affect adjacent follow-up queue actions if done too broadly.
- Mitigation: keep the change scoped to the existing handler and preserve all branching logic.
- Rollback: revert the handler change in `public/client-dashboard.html` if the dashboard regresses or async button actions stop working.
