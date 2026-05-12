# PR4 / PR5 Handoff Status

Refreshed: 2026-05-12  
Authoritative source plan: `.cursor/plans/tom_multi_stage_outbound_9c4e2b1a.plan.md`

This handoff file was originally written on 2026-05-11 when only PR4 slices 1-2 were landed. It is now refreshed to match the actual repo state.

## Current State

- The repo has progressed through:
  - PR4 slice 1: `09693a8`
  - PR4 slice 2: `0307955`
  - PR4 slice 3: `d13e8ab`
  - PR4 slice 4: `8c5d146`
  - PR4 slice 5: `4bc6f2e`
  - optional PR4 import/API context work: `2712a87`
  - PR5 per-lead message overrides: `7db6bcb`
- PR4 core implementation is present in code.
- PR4.5 stop/dismiss and audit behavior is present in code.
- The optional import/API persistence work is present in code.
- PR5 message-level lead overrides are present in code.
- The main remaining item that is **not proven by repo evidence** is the manual/staging gate:
  - `pr3_synthetic_run`
  - `pr3_acceptance`

## Where We Are Up To

| Phase | Status | Notes |
| --- | --- | --- |
| 0 | Not proven in repo | `pr3_synthetic_run` and `pr3_acceptance` are still the gating manual/staging checks from the plan. |
| 1 | Done | Schema + normalizer + policy/tests landed. |
| 2 | Done | Queue read + dial payload overlay landed. |
| 3 | Done | `outboundDialMode` stamping + dedupe freeze logic landed. |
| 4 | Done | `_importContext` allow-list + sequence config optional keys landed. |
| 5 | Done | Dashboard cohort filters and route/UI wiring landed. |
| 6 / PR4.5 | Done | Admin stop + salvage dismiss + bounded `_opsAudit` landed. |
| Optional PR4 | Done | Import/API writers for `lead_dial_context_json` landed. |
| PR5 | Done | Per-lead `firstMessage` / `systemMessage` overrides landed. |

## Exactly What Landed

### PR4 slice 1

- Added nullable `leads.lead_dial_context_json` in Postgres and SQLite migrations.
- Added `lib/lead-dial-context.js` and initial reserved-key / size gates.
- Added the first intent/policy/canary coverage.

### PR4 slice 2

- `lib/server-queue-workers.js` reads `lead_dial_context_json` on the queue path.
- `lib/instant-calling.js` applies the lead context as the final `assistantOverrides.variableValues` overlay.
- Added merge-order coverage and payload canary coverage.

### PR4 slice 3

- Outbound enqueue sites stamp `call_data.outboundDialMode`.
- `db/domains/call-queue.js` merges dedupe mode with the locked truth table.
- Canary coverage proves no downgrade from `sequence` to `classic`.

### PR4 slice 4

- `lib/outbound-sequence.js` validates `handoffImportContextKeys` and `classicFollowUpCutoverDate`.
- `lib/vapi-webhooks/outbound-sequence-webhook.js` writes bounded `qual._importContext` from the allowed lead context keys only.
- Intent + canary coverage landed for handoff import context behavior.

### PR4 slice 5

- Shared dashboard cohort logic landed in `lib/dashboard-follow-up-filters.js`.
- Route wiring landed in `routes/follow-up-queue.js`, `routes/lead-handoff.js`, and `routes/outbound-sequence-visibility-mount.js`.
- Unified cohort filter UI landed in `public/client-dashboard.html`.

### PR4.5

- Admin/operator stop and salvage dismiss logic landed in `lib/outbound-sequence-ops.js`.
- API routes landed in `routes/client-ops-mount.js`.
- `_opsAudit`, `_salvageDismissedAt`, and `_salvageDismissedBy` behavior is covered by canary tests.

### Optional PR4 import/API work

- Import/API paths now persist sanitized `lead_dial_context_json`.
- Zapier/custom field ingestion is wired to the same sanitizer path.

### PR5

- `lib/lead-dial-context.js` now supports an envelope with `variableValues`, `firstMessage`, and `systemMessage`.
- `lib/instant-calling.js` applies lead-owned `firstMessage` / `systemMessage` last, after sequence and A/B merges.

## Resume Point Now

There is no unfinished repo implementation slice left from the original PR4 plan.

If continuing from here, the next practical path is:

1. Confirm whether `pr3_synthetic_run` and `pr3_acceptance` were actually executed on staging.
2. If not, run that staging/manual sign-off and record the result.
3. If yes, choose the next product scope beyond PR5 rather than continuing old PR4 work.

## Most Important Remaining Check

- Verify the **manual/staging gate**, because that is the only part of the original plan still not evidenced in the repo:
  - `pr3_synthetic_run`
  - `pr3_acceptance`
  - the staging sign-off checklist items in the main plan

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

## Updated Short Checklist

- Open `.cursor/plans/tom_multi_stage_outbound_9c4e2b1a.plan.md` and this handoff file.
- Treat PR4 / PR4.5 code implementation as complete in-repo.
- Verify whether the staging/manual acceptance gate was completed outside the repo.
- If the staging gate is already done, define the next scope after PR5 instead of reopening old slices.
