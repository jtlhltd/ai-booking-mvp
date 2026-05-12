# Context
- The multi-stage outbound section is technically functional, but the runtime view is still hard to scan and understand quickly.
- The recent rows list mostly exposes raw sequence state, with limited lead context and weak affordances for selecting / understanding a row.
- The user explicitly asked to improve this section so it is easier to use and understand, and to show more lead data.
- This work should improve clarity and data density without changing underlying outbound/sequence behavior.

# Definition of done
- The sequence runtime section surfaces more lead context in both the recent list and the detail panel.
- Recent rows are easier to scan and select, with clearer status/cohort wording and better “what happens next” signals.
- The detail panel explains the selected lead in a more operator-friendly layout instead of exposing only raw debug fragments.
- Relevant route/UI-adjacent tests pass, and local `npm run test:ci` passes.

# Non-goals
- No changes to sequence enrollment, stop, or advancement behavior.
- No full redesign of the rest of the dashboard outside the sequence runtime section.
- No dependency on optional/migration-sensitive lead columns that may not exist everywhere.

# Work breakdown
- [ ] Enrich outbound-sequence API payloads with stable lead and handoff context for rows/detail.
- [ ] Improve the recent sequence list rendering and selection behavior in `public/client-dashboard.html`.
- [ ] Redesign the sequence lead detail panel to show clearer lead/context/next-step information.
- [ ] Add or update route tests covering the enriched payload shape.
- [ ] Run focused tests and `npm run test:ci`.
- [ ] Review, commit, and push.

# Risk & rollback
- Risk: adding lead-context queries could slow the sequence panel or fail on older schemas if optional columns are queried.
- Mitigation: only use stable base columns (`name`, `service`, `source`, `notes`, `status`, `created_at`) and keep joins/query fan-out bounded to the current page set.
- Rollback: revert the UX-upgrade commit to restore the simpler sequence panel if operators find the extra detail noisy.

## Amendments
- Add a visual polish pass focused on spacing, hierarchy, pane balance, and selection/empty states inside the sequence runtime panel.
- Reduce the “blank debug box” feel by giving the selected-lead panel a stronger empty/loading treatment and by styling the recent-list cards more clearly.
- Keep this pass frontend-only unless a small fallback is needed to avoid a confusing empty detail panel.
- Cap the runtime module height so the sequence section cannot consume an outsized share of the page; keep the detail and recent-list panes scrollable within that cap.
- Add explicit drill-in affordances for sequence rows so operators can click into call history and full lead journey without hunting through unrelated modules.
