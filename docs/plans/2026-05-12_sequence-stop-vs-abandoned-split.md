# Context
- The sequence window currently conflates two different outcomes: system-abandoned sequence rows and operator-stopped sequence rows.
- After bulk-stopping Tom's active rows, the summary count still reports `abandoned`, while the `Abandoned·salvage` list filter shows none because that filter only matches salvage/system-abandoned handoff sources.
- The user asked for a clean split rather than folding operator-stopped rows into the salvage bucket.
- This touches existing sequence dashboard/filter behavior, so intent docs and enforcement tests should be updated in the same change.

# Definition of done
- Dashboard cohort logic distinguishes `abandoned` (system/salvage) from `stopped` (operator stop).
- Sequence window and follow-up queue filters expose separate chips/labels for these outcomes.
- Sequence summary counts reflect the split so the top metrics agree with the filtered list semantics.
- Relevant tests are updated or added, and the local CI command passes.

# Non-goals
- No additional bulk cleanup of Tom leads in this step.
- No changes to core stop/dismiss mutation behavior beyond labeling/classification.
- No redesign of unrelated dashboard sections.

# Work breakdown
- [ ] Update cohort helper logic to classify operator-stopped rows separately from abandoned salvage rows.
- [ ] Update sequence visibility summary/list and dashboard chips/labels to expose the split.
- [ ] Update intent/tests/canaries to lock the new semantics.
- [ ] Run focused tests and `npm run test:ci`.
- [ ] Review, commit, and push.

# Risk & rollback
- Risk: changing cohort labels could break follow-up queue filters or previously expected abandoned semantics.
- Mitigation: update helper-level tests, route contract tests, and the existing sequence stop/dismiss canary together.
- Rollback: revert the cohort/filter split commit to restore prior `abandoned`-only behavior.
