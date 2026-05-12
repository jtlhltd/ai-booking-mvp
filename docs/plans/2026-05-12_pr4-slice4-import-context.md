# PR4 Slice 4: Sequence Handoff Import Context

## Context

- Continue PR4 after slice 3 by wiring the sequence webhook handoff path, not the dashboard slice.
- `qual._importContext` must only copy an allow-listed subset of per-lead outbound context into sequence completed/abandoned handoffs.
- Tenant `outbound_sequence_json` must accept optional root keys `handoffImportContextKeys` and `classicFollowUpCutoverDate` without breaking existing stage validation.
- Behavioral gates apply here because handoff/export surfaces are user-visible and must not leak raw lead dial context.

## Definition of done

- `validateOutboundSequenceConfig` accepts valid `handoffImportContextKeys` and `classicFollowUpCutoverDate`, and rejects malformed values.
- Sequence completed/abandoned handoffs write bounded `qual._importContext` from sanitized lead dial context using tenant allow-list or the locked code defaults.
- `docs/INTENT.md` includes the new handoff/import-context behavioral contract and at least one matching canary covers it.
- Targeted tests pass, and `npm run test:ci` passes before commit.

## Non-goals

- No dashboard/tab/filter work for classic/sequence/abandoned views.
- No import/API writer changes to populate `leads.lead_dial_context_json`.
- No changes to dial-time merge behavior already shipped in slices 1-3.

## Work breakdown

- [x] Add optional config validation/helpers in `lib/outbound-sequence.js`.
- [x] Build sanitized `_importContext` in `lib/vapi-webhooks/outbound-sequence-webhook.js` for completed/abandoned handoffs only.
- [x] Update `docs/INTENT.md` with a new handoff allow-list rule.
- [x] Add/update unit and canary coverage for config validation and handoff payload shaping.
- [x] Run targeted tests, then `npm run test:ci`.
- [x] Commit and push the slice.

## Risk & rollback

- Risk: handoff rows could accidentally include raw or reserved lead context keys.
  Rollback: revert the webhook `_importContext` helper and leave handoff payloads without import context.
- Risk: overly strict config validation could disable valid sequence tenants.
  Rollback: revert the new root-key validation while preserving prior stage validation logic.
