# Context
- Tom's live tenant still shows 171 active sequence rows in `lead_sequence_state`.
- The defaulting bug has been fixed in code, but existing active sequence rows remain and still pollute the dashboard state.
- The user explicitly chose the cleanup path to bulk-stop currently active sequence rows for Tom.
- The safest path is to use the existing authenticated operator stop endpoint rather than mutate production state ad hoc.

# Definition of done
- Fetch the currently active sequence leads for `d2d-xpress-tom`.
- Stop each active lead through the existing operator/API path.
- Verify the live summary no longer reports active sequence rows (or report any failures precisely).
- Avoid exposing secrets in logs or responses.

# Non-goals
- No dashboard redesign.
- No tenant config edits beyond this cleanup.
- No code changes to sequence behavior in this step.

# Work breakdown
- [x] Verify the required operator auth is available in the environment.
- [x] Enumerate Tom's current active sequence leads from the live API.
- [x] Stop those leads via the authenticated operator endpoint.
- [x] Re-check the live sequence summary and report the resulting counts.

# Risk & rollback
- Risk: a partial stop could leave a handful of rows active if the API rejects specific phones.
- Mitigation: capture success/failure counts and verify the live summary after the run.
- Rollback: there is no automatic restore for stopped rows; if a lead must re-enter sequence later, it should be re-enrolled explicitly via the supported opt-in path.
