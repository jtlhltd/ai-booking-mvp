# PR5: Per-Lead Message Overrides

## Context

- PR4 shipped only L1 lead context (`variableValues`) by design; PR5 unlocks the signed-off L2 scope for optional per-lead `firstMessage` and `systemMessage`.
- The current dial path in `lib/instant-calling.js` already applies lead context last for `variableValues`; this slice should extend that same final overlay point to lead-owned message text without disturbing sequence stage or A/B merge order.
- Existing import/API paths now populate `leads.lead_dial_context_json`, so this slice should be backward-compatible with both the current flat scalar shape and a new explicit envelope carrying message overrides.
- This touches outbound dialing behavior, so `docs/INTENT.md`, policy, canary coverage, and a full `npm run test:ci` run are required.

## Definition of done

- Lead dial context supports an explicit envelope with optional `variableValues`, `firstMessage`, and `systemMessage`.
- `lib/instant-calling.js` applies lead-level `firstMessage` / `systemMessage` after sequence and A/B merges, while preserving the existing reserved-key and scalar rules for `variableValues`.
- Existing flat PR4 context rows still work unchanged for `variableValues`.
- Import/API extractors allow explicit lead message overrides through the same bounded sanitizer.
- Intent/policy/canary/test coverage is updated, targeted tests pass, and `npm run test:ci` passes.
- Changes are committed and pushed.

## Non-goals

- No per-lead `model` or voice override support.
- No per-stage per-lead message overrides.
- No dashboard UI builder for composing lead-specific scripts.

## Work breakdown

- [x] Add a backward-compatible lead dial context envelope normalizer for `variableValues` plus optional message fields.
- [x] Update import/API extraction to preserve explicit `firstMessage` / `systemMessage` safely.
- [x] Extend `lib/instant-calling.js` to apply lead message overrides last without changing A/B or sequence ordering.
- [x] Update `docs/INTENT.md`, policy, and at least one canary for the new behavior.
- [x] Add/update focused unit coverage for normalizer and dial merge behavior.
- [x] Run targeted tests, then `npm run test:ci`.
- [x] Commit and push.

## Risk & rollback

- Risk: bad imported message text could override compliant tenant copy on live dials.
  Rollback: ignore lead-level `firstMessage` / `systemMessage` in the final merge and preserve only `variableValues`.
- Risk: changing the lead context shape could break existing PR4 rows.
  Rollback: keep flat-object support and treat unknown envelope keys as no-ops.
