# Tom multi-stage outbound sequence (regenerated plan)

## Context

- **Tom** (anchor tenant, internal key `d2d-xpress-tom`, display **D2D Xpress**) runs **courier / logistics lead qualification**: structured capture (lanes, volume, pain, authority, callback preference) so **human follow-up** stays short and high-close—not necessarily “book on first touch.”
- The original **Cursor Plan** for multi-call outbound lived in Cursor’s UI / old workspace path; after moving the repo **Desktop → `D:\`**, that plan was not carried as a repo file. This document **regenerates** the agreed product and engineering plan from **`docs/INTENT.md`**, **`docs/SEQUENCE_ROLLBACK.md`**, and the **current codebase**.
- **Multi-stage outbound** is **opt-in per tenant** via `tenants.outbound_sequence_json` (`enabled: true` + validated `stages`). Dialing still flows **call_queue → workers → Vapi**; the sequence layer **enqueues** next stages—it does **not** add new direct `api.vapi.ai/call` sites.

## Definition of done (Tom v1)

Observable outcomes:

1. **Tom’s tenant row** has a valid `outbound_sequence_json` after bootstrap: **three stages** (gatekeeper / DM ID → discovery → close & handoff), caps (`maxTotalDialsPerLead`, `maxSequenceDurationDays`, per-stage `maxAttemptsInStage`), and inter-stage delays aligned to “deliberate professional” cadence—**as seeded** in `db/migrations/seed-tom-outbound-sequence.js` when the column was `NULL`, or after a deliberate `RESEED_TOM_OUTBOUND_SEQUENCE=1` run.
2. **Runtime behavior**: end-of-call webhooks advance **at most one stage** per event; next stage gets `scheduled_for` in the future via `scheduleAtOptimalCallWindow`; no parallel active stages per lead; attempts and duration bounds enforced (`docs/INTENT.md` rows `sequence.*`).
3. **Safety / rollback**: operators can disable via **per-tenant JSON** (`enabled: false`) or **`OUTBOUND_SEQUENCE_DISABLED=1`** (`docs/SEQUENCE_ROLLBACK.md`); `npm run test:ci` passes including policy, canaries, and sequence-related tests.
4. **Tenant hygiene**: internal `client_key` does not leak into customer-facing payloads or Vapi metadata where forbidden (`tenant.no-internal-key-leak` in `docs/INTENT.md`).

## Non-goals (explicit v1 exclusions)

- **Backfill** of historical “already called once” leads into mid-sequence stages (defer to v2 unless product explicitly demands it).
- **Per-stage voicemail scripts** distinct from tenant-level voicemail (defer to v2; v1 assumes existing opt-out / SMS STOP and pre-dial `opt_out_list` behavior).
- **Mid-call DNC** captured as a structured field for auto-abandon in v1 (risk accepted per original design: human handoff reads transcripts; v2 can add `requestedStopCalling` or equivalent).
- **Enabling multi-stage by default for all tenants**—other tenants remain legacy single-call until they opt in with valid JSON.

## Architecture (reference)

| Concern | Where |
|--------|--------|
| Validated config + scheduling math | `lib/outbound-sequence.js` |
| Webhook → next queue row / handoff | `lib/vapi-webhooks/outbound-sequence-webhook.js` (imported from `process-webhook-payload.js`) |
| Per-lead state | `db/domains/lead-sequence-state.js`, table `lead_sequence_state` |
| Dial path merges stage overrides | `lib/instant-calling.js` |
| Tom seed JSON | `db/migrations/seed-tom-outbound-sequence.js` (invoked from `db.js` bootstrap—non-fatal on failure) |
| Dashboard / API surfacing of stages | `routes/lead-handoff.js`, outbound sequence visibility routes under `tests/routes/outbound-sequence-visibility.contract.test.js` |
| Behavioral contract | `docs/INTENT.md` (sequence rows), `scripts/check-policy.mjs`, `tests/canaries/*.canary.test.js`, `lib/ops-invariants.js` |

## Work breakdown

### A. Already implemented in repo (verify, do not re-build blindly)

- [ ] Confirm Tom seed matches product intent (prompt copy, `requiredFields` / `optionalFields`, delays)—edit **only** via migration/env as appropriate, not scattered hardcodes.
- [ ] Confirm production **`VAPI_STRUCTURED_OUTPUT_ID`** (and any per-stage overrides if you later split IDs) match the Vapi workspace used for Tom.
- [ ] Run **`npm run test:ci`** after any config or prompt change.
- [ ] Staging smoke: one lead → stage 1 → structured fill → stage 2 queued with future `scheduled_for` → repeat through final handoff row / export path Tom’s team uses.

### B. Remaining product / ops work (not all code)

- [ ] **Tom sign-off** on live transcripts for stage tone, gatekeeper wording, and “no pitch on stage 1” discipline.
- [ ] **Operator runbook**: link internal wiki/runbook to `docs/SEQUENCE_ROLLBACK.md` + kill switch; train on reading `sequence.stages` on handoff.
- [ ] **Monitor** ops invariants related to sequences (`lib/ops-invariants.js`) after cutover; investigate stale active sequences.

### C. Optional v2 backlog (only if prioritized)

- [ ] Backfill rules for leads with prior single-call history.
- [ ] Per-stage voicemail audio/copy.
- [ ] Structured mid-call DNC → auto-abandon.
- [ ] Per-tenant A/B or analytics (handoff completeness, time-to-handoff)—see original Cursor plan ideas; none block v1.

## Risk & rollback

| Risk | Mitigation |
|------|------------|
| Bad prompt or schema causes poor qual or stuck stages | Disable sequence for Tom (`enabled: false`) or global `OUTBOUND_SEQUENCE_DISABLED=1`; fix JSON; optional `RESEED_TOM_OUTBOUND_SEQUENCE=1` to restore canonical seed (overwrites in-place JSON). |
| Webhook / worker issues strand leads | Ops invariants + `sequence.stale-active-sequence`; manual queue inspection per existing ops playbooks. |
| Tenant key in external payloads | Policy + canaries + `assertNoTenantKeyLeak` patterns in tests (`docs/TESTING.md`). |

## Amendments

- *(None yet—append here if this plan changes materially during implementation.)*
