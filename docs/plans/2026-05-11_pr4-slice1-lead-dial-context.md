# PR4 slice 1 — `leads.lead_dial_context_json` + parse/validate helpers

## Context

- Execution detail lives in `.cursor/plans/tom_multi_stage_outbound_9c4e2b1a.plan.md` (Part IV); this file satisfies the repo **persist execution plans** rule for the slice that lands first.
- Additive column for per-lead dial overlay data (JSON), with bounded size and reserved-key stripping so sequence `variableValues` cannot be overridden by imports.

## Definition of done

- Postgres + SQLite migrations add nullable `lead_dial_context_json` where missing.
- `lib/lead-dial-context.js` exports constants + `parseLeadDialContextFromDb` + size validation used by writers (later slices).
- `docs/INTENT.md` row `dial.lead-dial-context-contained` and matching `scripts/check-policy.mjs` rule.
- Unit tests + one canary; `npm run test:ci` passes.

## Non-goals

- No worker `SELECT` / `callLeadInstantly` merge yet (next slice).
- No route or import API to populate the column yet.

## Work breakdown

- [x] Migrations (Postgres JSONB, SQLite TEXT + `PRAGMA` guard).
- [x] `lib/lead-dial-context.js` + `tests/unit/lead-dial-context.test.js` + `tests/canaries/lead-dial-context-sanitized.canary.test.js`.
- [x] INTENT + check-policy.

## Risk and rollback

- Column is nullable; rollback = leave column unused or drop in a follow-up migration (not automated here).

## Amendments

- None yet.
