# Context
- Tom's tenant currently enrolls outbound leads into multi-stage sequence mode by default whenever tenant sequence config is enabled.
- The requested behavior is the opposite: default outbound remains `classic`, and multi-call sequence runs only for leads that explicitly opt in.
- This is a behavioral / billing-affecting change in outbound dialing, so the intent contract and an enforcement gate must be updated in the same change.
- The existing per-lead `lead_dial_context_json` path is the safest place to carry explicit lead-level sequence opt-in metadata without adding silent tenant-wide defaults.

# Definition of done
- New outbound leads default to `classic` unless the lead explicitly opts into sequence.
- Tenant-level sequence config remains a prerequisite, but is no longer sufficient by itself to enroll every lead.
- At least one behavioral enforcement gate covers the new opt-in requirement.
- `docs/INTENT.md` reflects the new contract.
- `npm run test:ci` passes.

# Non-goals
- No redesign of Tom's operator dashboard.
- No new bulk management UI for opting leads in/out.
- No change to stage advancement rules once a lead is explicitly enrolled in sequence.

# Work breakdown
- [x] Inspect and centralize the lead-level sequence enrollment decision.
- [x] Patch new-lead and import outbound paths so default mode is `classic` and sequence requires explicit lead opt-in.
- [x] Update intent documentation and add/update a canary or equivalent enforcement gate.
- [x] Run focused tests, then run `npm run test:ci`.
- [ ] Review diff, commit, and push.

# Risk & rollback
- Risk: changing enrollment logic could strand legitimate sequence leads if the opt-in signal is not read consistently across import and queue paths.
- Mitigation: centralize the enrollment predicate and cover it with tests/canaries.
- Rollback: revert this change or temporarily restore prior tenant-wide behavior by removing the lead-level opt-in requirement in the enrollment predicate.
