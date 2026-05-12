# PR4 Optional: Import/API Lead Dial Context Population

## Context

- The remaining optional PR4 item is to populate `leads.lead_dial_context_json` when import/API payloads already carry extra CRM-style fields.
- The repo has three practical write surfaces for this: JSON lead import (`/api/leads/import`), CSV upload/import (`/api/import-leads/:clientKey`), and Zapier webhook imports via `customFields`.
- Imported lead dial context must reuse the existing sanitizer in `lib/lead-dial-context.js` so reserved keys stay blocked and only bounded scalar values persist.
- This should stay additive: no changes to dial merge order, sequence webhook `_importContext`, or unrelated lead portals.

## Definition of done

- Import/API write paths persist sanitized `lead_dial_context_json` when structured extra fields are present.
- CSV imports support explicit mapping of selected columns into lead dial context without changing existing core lead columns.
- Zapier imports map `customFields` into `lead_dial_context_json`.
- `docs/INTENT.md` / policy allow-lists are updated if needed for the new writer surfaces.
- Targeted tests pass, then `npm run test:ci` passes.
- Changes are committed and pushed.

## Non-goals

- No new message-level per-lead overrides beyond `variableValues`.
- No retrofitting unrelated lead edit portals or manual CRM screens.
- No new tenant-visible dashboard workflow beyond data being available on future dials/handoffs.

## Work breakdown

- [x] Add shared helper(s) to sanitize import/API lead dial context payloads for storage.
- [x] Wire `/api/leads/import` to persist sanitized extra context when present on lead rows.
- [x] Wire CSV parsing/import so mapped extra columns land in `lead_dial_context_json`.
- [x] Wire Zapier `customFields` to the same storage path.
- [x] Update policy/intent/tests for the newly approved writer surfaces.
- [x] Run targeted tests, then `npm run test:ci`.
- [x] Commit and push.

## Risk & rollback

- Risk: imports could overwrite good dial context with empty/oversize payloads.
  Rollback: stop writing the column on import paths and preserve the existing nullable column behavior.
- Risk: CSV mapping could accidentally duplicate core fields into dial context.
  Rollback: clamp mapping to explicit non-core context keys and ignore unmapped extras.
