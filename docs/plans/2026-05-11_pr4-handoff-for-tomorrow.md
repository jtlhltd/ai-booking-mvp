# PR4 Handoff For Tomorrow

Generated: 2026-05-11  
Authoritative source plan: `.cursor/plans/tom_multi_stage_outbound_9c4e2b1a.plan.md`

This is a convenience handoff copy so work can resume cleanly tomorrow. The authoritative evolving plan remains `.cursor/plans/tom_multi_stage_outbound_9c4e2b1a.plan.md`.

## Current State

- PR4 is being shipped in small slices.
- Slice 1 completed and pushed: `09693a8`  
  Add `leads.lead_dial_context_json` schema + helper + policy + tests.
- Slice 2 completed and pushed: `0307955`  
  Wire queue-worker read + `callLeadInstantly` payload merge + merge-order canary.
- Handoff PDF/HTML completed and pushed: `551cad0`
- The first two implementation slices both passed `npm run test:ci`.

## Where We Are Up To

| Phase | Status | Notes |
| --- | --- | --- |
| 0 | Pending gate | `pr3_synthetic_run` and `pr3_acceptance` staging gate still exists before PR4 should be considered rollout-safe. |
| 1 | Done | Schema + normalizer skeleton + policy + unit/canary tests completed in slice 1. |
| 2 | Done | Queue read + dial payload overlay + merge-order canary completed in slice 2. |
| 3 | Next | `outboundDialMode` stamping across enqueue sites plus dedupe merge lock in `db/domains/call-queue.js`. |
| 4 | Pending | `validateOutboundSequenceConfig` optional keys + webhook `qual._importContext` builder + INTENT/canaries. |
| 5 | Pending | Dashboard unified filters + server predicates. |
| 6 / PR4.5 | Pending | Admin stop + dismiss + `_opsAudit` + UI/API. |

## Exactly What Landed

### Slice 1

- Added nullable `leads.lead_dial_context_json` in Postgres and SQLite migrations.
- Added `lib/lead-dial-context.js` with reserved-key stripping and size validation.
- Added intent row `dial.lead-dial-context-contained` plus policy allow-list.
- Added unit test and first canary.

### Slice 2

- `lib/server-queue-workers.js` now selects `lead_dial_context_json` on the queue path and normalizes it before dialing.
- `lib/instant-calling.js` now takes explicit `leadDialContext` and applies it as the final shallow `assistantOverrides.variableValues` overlay.
- `normalizeLeadDialContext()` now strips reserved keys, keeps scalar values only, and drops oversize payloads.
- Added merge-order coverage in unit tests and a payload-capture canary in `tests/canaries/lead-outbound-context-merge.canary.test.js`.

## Resume Point Tomorrow

1. Start with Phase 3 / slice 3: stamp `call_data.outboundDialMode` on every outbound `addToCallQueue` site.
2. Implement the locked dedupe merge truth table in `db/domains/call-queue.js` for both Postgres and SQLite branches.
3. Add freeze canary coverage for same-phone duplicate enqueues proving stored mode follows the lock table and never downgrades `sequence` to `classic`.
4. Run `npm run test:ci`.
5. Commit as PR4 slice 3, then continue to webhook `_importContext` work.

## Primary Files For The Next Slice

- `db/domains/call-queue.js`
- `lib/server-queue-workers.js`
- `lib/lead-import-outbound.js`
- `lib/follow-up-processor.js`
- `lib/vapi-webhooks/outbound-sequence-webhook.js`
- `routes/import-leads.js`
- `lib/leads-import.js`
- `lib/twilio-sms-inbound-webhook.js` if it enqueues `vapi_call`

## Copied Plan Excerpt: Execution Phases

| Phase | Contents | Blocked until |
| --- | --- | --- |
| 0 | Complete `pr3_synthetic_run` + `pr3_acceptance` on staging | PR4 merge to `main` |
| 1 | Schema `lead_dial_context_json` + policy allowlist + normalizer skeleton + unit tests | - |
| 2 | `processVapiCallFromQueue` SELECT + wire into `callLeadInstantly`; merge overlay + tests | Phase 1 |
| 3 | `outboundDialMode` stamp all enqueue paths + `call-queue` dedupe rule + canary | Phase 2 |
| 4 | `validateOutboundSequenceConfig` optional keys + `_importContext` builder in webhook + INTENT/canary | Phase 2 |
| 5 | Dashboard unified filters + server predicates + copy | Phases 2-4 |
| 6 | PR4.5 admin stop + dismiss + `_opsAudit` + routes + UI | Phase 3 minimum |

## Copied Plan Excerpt: Definition Of Done

1. Schema: `leads.lead_dial_context_json` exists and queue-path reads include it.
2. Dial path: normalized JSON merges as `variableValues` only, after sequence and after A/B merge.
3. Normalizer: `lib/lead-dial-context.js` with reserved key stripping, size cap, and no tenant-key leak in merged vars.
4. Queue snapshot: enqueue paths stamp `outboundDialMode`; dedupe merges mode per locked truth table.
5. Tenant JSON: `validateOutboundSequenceConfig` accepts `handoffImportContextKeys` and `classicFollowUpCutoverDate`.
6. Handoffs: completed or abandoned sequence writes bounded `qual._importContext` from an allow-list only.
7. INTENT + policy + canaries cover merge order, tenant-key safety, dial-mode freeze, and bounded import context.
8. Dashboard filters and server predicates match the agreed cohort logic.
9. PR4.5 adds admin-only stop + dismiss + bounded `qual._opsAudit`.
10. `npm run test:ci` is green.

## Copied Plan Excerpt: Locked Dedupe Truth Table

| Existing | Incoming | Result |
| --- | --- | --- |
| `sequence` | any | `sequence` (never downgrade) |
| `classic` | `sequence` | `sequence` |
| `classic` | `classic` or null | `classic` |
| null | `sequence` | `sequence` |
| null | `classic` | `classic` |
| null | null | null (infer at dial) |

## Copied Plan Excerpt: PR Slice Order

1. Schema + normalizer + policy allowlist + unit tests.
2. `processVapiCallFromQueue` + `callLeadInstantly` overlay + merge-order canary.
3. `outboundDialMode` all enqueue sites + dedupe merge + freeze canaries.
4. Webhook `_importContext` + INTENT rows for handoff/import bounds.
5. Dashboard filters.
6. PR4.5 stop / dismiss / `_opsAudit`.

## Tomorrow's Short Checklist

- Open `.cursor/plans/tom_multi_stage_outbound_9c4e2b1a.plan.md` and this handoff file.
- Start at Phase 3 / PR4 slice 3.
- Keep the locked dedupe truth table unchanged.
- Add the new canary in the same PR as the dedupe merge.
- Do not start webhook `_importContext` until slice 3 is green.
