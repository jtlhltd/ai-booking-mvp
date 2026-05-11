# PR4 slice 2 — queue read + dial payload overlay

## Context

- Slice 1 added nullable `leads.lead_dial_context_json` plus sanitizing helpers and the containment intent/policy gate.
- This slice wires the column into the outbound dial path only: queue worker lead lookup and `callLeadInstantly` payload construction.
- Merge order must stay `tenant/base -> sequence -> A/B -> lead_dial_context_json overlay`, with the lead overlay limited to shallow `assistantOverrides.variableValues`.

## Definition of done

- `processVapiCallFromQueue` selects `lead_dial_context_json`, normalizes it, and passes it into `callLeadInstantly`.
- `callLeadInstantly` applies the sanitized lead context as the final shallow `variableValues` overlay without replacing the rest of `assistantOverrides`.
- `docs/INTENT.md` reflects the dial-path merge behavior and a canary captures the actual Vapi payload merge result.
- `scripts/check-policy.mjs` still constrains `lead_dial_context_json` references to allow-listed files.
- `npm run test:ci` passes.

## Non-goals

- No `outboundDialMode` stamping/dedupe work yet.
- No webhook `_importContext` handoff work yet.
- No import/API writers for `lead_dial_context_json` yet.

## Work breakdown

- [ ] Extend queue-worker lead lookup and parse the DB value.
- [ ] Add an explicit `leadDialContext` param to `callLeadInstantly` and overlay it after sequence + A/B.
- [ ] Tighten/clarify lead dial context normalization for dial-time payload use.
- [ ] Update INTENT + policy allow-list and add a merge-order canary.
- [ ] Run `npm run test:ci`.

## Risk and rollback

- Main risk is silent override order regressions in Vapi `assistantOverrides.variableValues`; the canary captures the final payload to make that visible.
- Rollback is straightforward: revert this slice and the column remains nullable/unused.
