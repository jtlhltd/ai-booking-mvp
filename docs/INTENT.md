# Behavioral Intent Contract

This file is the **single source of truth** for what the system MUST do
behaviorally — not just what compiles or what passes a unit test.

It exists because a recent regression (imports dialing 50 leads in a burst
instead of distributing them through `scheduleAtOptimalCallWindow`) was green
on every existing CI gate. CI proves the code *runs*. This document, plus the
gates wired to its IDs, prove the code *does what we want*.

## How this file is used

Each row below has:

- **ID** — stable string, e.g. `dial.imports-distribute-not-burst`. Used as a
  key in [scripts/check-policy.mjs](../scripts/check-policy.mjs), the
  `tests/canaries/*.canary.test.js` describe blocks, and the violation rows
  emitted by [lib/ops-invariants.js](../lib/ops-invariants.js).
- **Statement** — plain English. Anyone (including non-coders) should be able
  to read it and decide whether a flow they observed is in or out of policy.
- **Constrains** — files / functions whose behavior the rule is about.
- **Enforced by** — at least one of: `policy` (CI grep gate), `canary`
  (Jest behavioral test), `invariant` (runtime cron check).
- **Manual disprove** — how a non-coder can verify it on a live system, with
  the expected observation.

When a rule changes, update the matching enforcement in the same PR. The
[behavioral-gates Cursor rule](../.cursor/rules/behavioral-gates.mdc) makes
this mandatory for any change touching dialing, queueing, lead routing,
tenant boundaries, or billing-affecting paths.

## Domain: dial

Outbound calling is the primary cost center and the most user-visible
behavior. Rules here exist because regressions cause real money loss
(unthrottled bursts, voicemail loops) or real reputational harm (calls
fired outside business hours, internal tenant keys leaking into Vapi).

| ID | Statement | Constrains | Enforced by | Manual disprove |
| --- | --- | --- | --- | --- |
| `dial.no-direct-vapi-outside-worker` | Only the queue worker (`lib/instant-calling.js`) and follow-up retry processor (`lib/follow-up-processor.js`) may call `https://api.vapi.ai/call` directly. Routes/imports/recalls must enqueue and let the worker dial. | `routes/**`, `lib/lead-import-outbound.js`, `lib/follow-up-processor.js#sendRetryCall`, `routes/leads-followups.js` | policy, canary | Search for `api.vapi.ai/call` in any non-allow-listed file. There must be exactly zero matches. |
| `dial.imports-distribute-not-burst` | Imported lead lists must be enqueued through `runOutboundCallsForImportedLeads` and distributed via `scheduleAtOptimalCallWindow`. They MUST NOT call `processCallQueue` synchronously from `routes/import-leads.js`. | `routes/import-leads.js`, `lib/lead-import-outbound.js` | policy, canary, invariant | Import 50 leads in business hours; observe `call_queue` rows spread across time, not all at `NOW()`. The `import_burst_unspaced` invariant must remain `0`. |
| `dial.recall-goes-through-scheduler` | `POST /api/leads/recall` must produce a `call_queue` row with a future `scheduled_for` and respond `{ ok: true, queued: true, scheduledFor: <ISO> }`. It MUST NOT `fetch('https://api.vapi.ai/call')`. | `routes/leads-followups.js#/recall` | policy, canary | Hit `/api/leads/recall`; response should include `queued: true`. A new `vapi_call` row must appear in `call_queue` for that phone with `priority = 9`. |
| `dial.retry-goes-through-scheduler` | `sendRetryCall` in the follow-up processor must enqueue a `call_queue` row, not dial directly. | `lib/follow-up-processor.js#sendRetryCall` | policy, canary | Trigger a retry via the follow-up processor; verify a `call_queue` insert (`priority = 7`, `triggerType: 'follow_up_retry'`) and zero outbound `fetch` to Vapi. |
| `dial.business-hours-respected` | Recalls outside business hours return `403 outside_business_hours`. The queue worker must not dial outside business hours. | `routes/leads-followups.js`, `lib/instant-calling.js` | canary | Hit `/api/leads/recall` outside hours; response is 403 with `error: 'outside_business_hours'`. |
| `dial.lead-dial-context-contained` | Optional per-lead `leads.lead_dial_context_json` is a tightly contained source for sanitized outbound context. Only allow-listed modules may reference or write the column name; `normalizeLeadDialContext` / `normalizeLeadDialContextEnvelope` must strip reserved `variableValues` keys (`leadName`, `tenantBusinessName`, `decisionMakerName`, `decisionMakerRole`, `bestCallbackWindow`, `priorCallWasSubstantive`, `daysSinceLastCall`, `isFollowUpCall`, `isFinalStage`, `client_key`, `tenant_key`, `phone`, `lead_contact_phone`, `email`), keep only scalar `variableValues`, bound optional top-level `firstMessage` / `systemMessage`, and drop oversize payloads. Approved import/API writers must sanitize extra fields through the same helper before persistence. In `callLeadInstantly`, the sanitized lead context is applied as the final shallow `assistantOverrides.variableValues` overlay plus optional final lead-owned `firstMessage` / `systemMessage` overrides after sequence and A/B merges; lead message overrides must be skipped when they contain obvious internal-key text. In the sequence webhook it may only feed the separate allow-listed `qual._importContext` handoff path. | `db/migrations/`, `db.js`, `lib/lead-dial-context.js`, `lib/lead-import.js`, `lib/leads-import.js`, `lib/server-queue-workers.js`, `lib/instant-calling.js`, `lib/vapi-webhooks/outbound-sequence-webhook.js` | policy, canary | Store JSON with reserved keys, safe custom keys, and lead-level message text; on the dial payload, reserved keys are absent, only non-reserved `variableValues` survive, and message overrides win only when they do not contain internal-key-like text. On import/API writes, only sanitized scalar fields and bounded top-level message overrides may persist. On sequence handoff rows, only the configured/default `_importContext` keys may appear, never the raw blob or reserved keys. |

## Domain: queue

The `call_queue` table is the single execution channel for all dials.
Rules here keep the queue from clumping (top-of-hour spikes), stalling
(stuck `processing`), or losing work (`completed` with no Vapi id).

| ID | Statement | Constrains | Enforced by | Manual disprove |
| --- | --- | --- | --- | --- |
| `queue.spread-min-spacing` | Adjacent pending `vapi_call` rows for a tenant's next business day should be spaced by at least `LEAD_QUEUE_MIN_SPACING_MS` (default 15s). Same instant collisions are a regression. | `lib/lead-import-outbound.js`, `lib/optimal-call-window.js` | canary, invariant | Inspect `call_queue` for tomorrow; no two pending rows for the same tenant share an exact `scheduled_for`. |
| `queue.no-top-of-hour-clump` | The number of pending `vapi_call` rows scheduled at exactly `HH:00:00` local time must stay below `OPS_INVARIANTS_ON_HOUR_SPIKE_THRESHOLD` (default 25). | `lib/optimal-call-window.js`, scheduler call sites | invariant | `lib/ops-invariants.js#onHour` query. The `top_of_hour_spike` problem must not appear. |
| `queue.no-phantom-completed` | Rows MUST NOT transition to `status='completed'` with `initiated_call_id IS NULL`. That indicates a worker bug or race. | `lib/instant-calling.js`, queue worker write paths | invariant | `lib/ops-invariants.js#phantom` query returns 0. |
| `queue.no-stuck-processing` | Rows in `status='processing'` whose `updated_at` is older than `OPS_INVARIANTS_STUCK_PROCESSING_MINUTES` (default 15) indicate a crashed worker. | queue worker, reaper | invariant | `lib/ops-invariants.js#stuck` returns 0. Reaper job (`lib/stuck-processing-reaper.js`) must be running. |
| `queue.retry-backlog-bounded` | `retry_queue` rows whose `scheduled_for <= NOW()` must stay below `OPS_INVARIANTS_RETRY_DUE_THRESHOLD` (default 50). Larger means workers aren't draining or failures are being re-queued without a future `scheduled_for` backoff. | `lib/follow-up-processor.js`, retry worker | invariant, policy | `lib/ops-invariants.js#retryDue` returns < threshold. Policy gate forbids reintroducing "pending + attempt++" without also rescheduling `scheduled_for`. |
| `queue.concurrency-cap` | The queue worker must never have more than `VAPI_MAX_CONCURRENT` (default 1) Vapi requests in flight at once. `acquireVapiSlot` blocks the surplus until a slot is released. | `lib/instant-calling.js#acquireVapiSlot` | canary | Fire `N+1` simultaneous `acquireVapiSlot()` calls; the surplus must remain pending until a release. |
| `queue.dedupe-active-call` | The queue worker must not start a second Vapi call for a phone with an already-active call id on the same instance. | `lib/instant-calling.js#callLeadInstantly` | canary | Mark a phone active via `markVapiCallActive(callId, { phone })`; a follow-up `callLeadInstantly` for that phone must return `{ ok: false, error: 'phone_already_active' }` and never `fetch` Vapi. |
| `queue.outbound-dial-mode-freeze` | Pending/processing `vapi_call` rows must preserve `call_data.outboundDialMode` as a queue snapshot. Dedupe in `addToCallQueue` merges mode with the locked truth table: `sequence` never downgrades to `classic`, `classic` upgrades to `sequence` when a new sequence enqueue collides, and null only becomes non-null when the incoming row specifies it. | `db/domains/call-queue.js`, outbound enqueue call sites | canary | Enqueue the same phone twice with conflicting modes; the stored row must keep `sequence` if it ever appeared, and must promote null/classic only according to the truth table. |
| `queue.worker-imports-scheduling-and-resilience` | `lib/server-queue-workers.js` MUST statically import `selectOptimalAssistant` from `./server-assistant-scheduling.js`, `categorizeError` from `./server-call-resilience.js`, `resolveLogisticsSpreadsheetId` from `./dashboard-ui-formatters.js`, and `patchLogisticsRowByNumber` from `../sheets.js` whenever those symbols are used, so queue/retry cron paths never throw `ReferenceError` at runtime. | `lib/server-queue-workers.js` | policy | Remove any of these `import` lines locally; `npm run check:policy` must fail. |

## Domain: tenant

Tom is the anchor client and lives behind the tenant key `d2d-xpress-tom`.
Customer-facing surfaces (Vapi payloads, transcripts, dashboard copy) must
never carry the internal key — only display names. Cross-tenant access
must always 403, never silently 200.

| ID | Statement | Constrains | Enforced by | Manual disprove |
| --- | --- | --- | --- | --- |
| `tenant.no-internal-key-leak` | The internal tenant key `d2d-xpress-tom` (and any other internal client_key) MUST NOT appear in Vapi payload `metadata`, transcripts, customer-facing copy, or response bodies. Use `displayName` instead. | `routes/**`, `lib/instant-calling.js`, `lib/follow-up-processor.js`, `lib/outbound-ab-dashboard-handlers.js` (env-driven dashboard defaults only), prompt builders | policy (allow-listed: `db.js`, `tests/`, `e2e/`, `scripts/`, `docs/`), canary | `assertNoTenantKeyLeak(res, 'd2d-xpress-tom')` on every customer-facing response. |
| `tenant.dashboard-client-key-spelling` | The anchor logistics tenant may be looked up under either `u2d-xpress-tom` or `d2d-xpress-tom` in URLs and API paths; `getFullClient` MUST try the caller spelling first, then the paired spelling, and MUST NOT merge unrelated tenants. Dashboard self-service ACL MUST treat either spelling like the configured allow-list entry. | `lib/client-key-lookup.js`, `db.js#getFullClient`, `db.js#invalidateClientCache`, `lib/outbound-ab-dashboard-handlers.js#isDashboardSelfServiceClient` | policy, unit (`tests/unit/lib/client-key-lookup.test.js`, `tests/unit/lib/outbound-ab-dashboard-handlers.test.js`, `tests/unit/root/db.test.js`) | With a DB row for only one of the two keys, `GET /api/clients/<other-spelling>` still returns the same tenant; with env `DASHBOARD_SELF_SERVICE_CLIENT_KEYS=d2d-xpress-tom`, `isDashboardSelfServiceClient('u2d-xpress-tom')` is still true. |
| `tenant.cross-tenant-isolation` | Authenticated requests with a `clientKey` the caller does not own must return 403, never silent 200. | `routes/**` admin/client surfaces | canary (uses `assertTenantIsolation`) | Authenticate as tenant A, request tenant B's resources; response must be 401/403. |
| `tenant.auth-required-on-admin` | Admin/client endpoints must return 401 when `X-API-Key` is missing or invalid. | `routes/admin-*.js`, `routes/client-*.js` | canary (uses `assertAuthRequired`) | Send a request without `X-API-Key`; response must be 401 with a JSON error envelope. |

## Domain: billing

Spend on Vapi credits is bounded by a small set of measurable behaviors:
spread (no bursts), idle-call control (voicemail/no-answer cutoffs), and
respecting the wallet check before placing a call.

| ID | Statement | Constrains | Enforced by | Manual disprove |
| --- | --- | --- | --- | --- |
| `billing.no-burst-dial` | Across all tenants, the count of `calls` rows with `created_at > NOW() - 5m` divided by distinct minute buckets must stay below the configured threshold. A burst usually indicates an unthrottled import or a stuck retry loop. | queue worker, all enqueue call sites | invariant | `lib/ops-invariants.js#dial_burst_detected` returns 0. |
| `billing.wallet-check-before-dial` | When `markVapiWalletDepleted()` has been called (because Vapi recently returned a wallet/credits error), `callLeadInstantly` must return `{ ok: false, error: 'vapi_wallet_depleted' }` and skip `fetch('https://api.vapi.ai/call')` entirely until the flag clears. The queue worker keeps the row `pending`. | `lib/instant-calling.js#callLeadInstantly`, `lib/server-queue-workers.js#processVapiCallFromQueue` | canary | After `markVapiWalletDepleted()`, a call attempt must return `vapi_wallet_depleted` and the global fetch must not be invoked. |
| `billing.wallet-check-keeps-queue-pending` | When the wallet gate is active (`vapi_wallet_depleted`), the queue worker MUST defer the `call_queue` row (keep `status='pending'` with a future `scheduled_for`) and MUST NOT record a synthetic `failed_q...` call row. | `lib/server-queue-workers.js#processVapiCallFromQueue` | policy, canary | Set wallet depleted; observe queue items remain `pending` and advance `scheduled_for` (no new `calls` rows with `call_id` starting `failed_q`). |
| `billing.vapi-not-configured-defers` | When Vapi is not configured (missing `VAPI_PRIVATE_KEY` / `VAPI_ASSISTANT_ID` / `VAPI_PHONE_NUMBER_ID`), outbound dials MUST be deferred (queue rows kept `pending`) rather than marked failed or generating synthetic `failed_q...` call rows. | `lib/instant-calling.js#callLeadInstantly`, `lib/server-queue-workers.js#processVapiCallFromQueue`, `lib/server-queue-workers.js#processRetryQueue` | canary | Unset Vapi env vars; observe queue items remain `pending` with a future `scheduled_for`, and retries do not dial directly. |
| `billing.idle-call-cutoffs` | Every outbound Vapi payload built by `lib/instant-calling.js` must include `assistantOverrides.maxDurationSeconds`, `assistantOverrides.silenceTimeoutSeconds`, `assistantOverrides.endCallOnSilence`, and `assistantOverrides.voicemailDetection`. These bound the worst-case spend on idle / voicemail / runaway calls. | `lib/instant-calling.js#callLeadInstantly` payload builder | canary | Intercept the Vapi payload; the four cutoff fields must be present and within sane bounds. |
| `billing.max-retries-bounded` | A single lead cannot generate more than `MAX_RETRIES_PER_LEAD` (default 3) `vapi_call` retry rows in the configured window (`MAX_RETRIES_PER_LEAD_WINDOW_HOURS`, default 24). `sendRetryCall` must refuse to enqueue when the cap is reached. | `lib/follow-up-processor.js#sendRetryCall` | canary, invariant | Pre-populate `MAX_RETRIES_PER_LEAD` retry rows for a phone; the next `sendRetryCall` must return `{ ok: false, error: 'max_retries_exceeded' }`. `lib/ops-invariants.js#retry_loop_per_lead` returns 0 over the lookback window. |

## Domain: scheduling

The scheduler (`lib/optimal-call-window.js#scheduleAtOptimalCallWindow`) is the
single point where every enqueued dial picks a `scheduled_for` instant. A bad
output here defeats every other distribution gate: a row with `scheduled_for`
in the past is dialed immediately, which means a regression here turns into a
burst.

| ID | Statement | Constrains | Enforced by | Manual disprove |
| --- | --- | --- | --- | --- |
| `scheduling.no-past-scheduled-for` | `scheduleAtOptimalCallWindow` must never return a `Date` strictly earlier than the `baseline` it was given. New `vapi_call` `call_queue` rows in the last 5 minutes must not have `scheduled_for < created_at`. | `lib/optimal-call-window.js`, all enqueue call sites | canary, invariant | Call `scheduleAtOptimalCallWindow(client, null, now)`; result `>= now`. `lib/ops-invariants.js#past_scheduled_for` returns 0. |
| `scheduling.export-timezone-contract` | CSV exports must include explicit timezone semantics: UTC timestamp columns plus tenant-local timestamp columns and tenant timezone label. Export routes must not emit ambiguous JS date-string-only timestamp columns. | `routes/core-api.js`, `routes/admin-clients.js`, dashboard export triggers | canary | Export leads/calls/appointments and verify columns include UTC + Local + Tenant Timezone; values must be parseable timestamps (not only locale-rendered browser strings). |

## Domain: webhook

Inbound webhooks (Vapi end-of-call reports, Twilio voice) are write paths
controlled by third parties. They must verify provider signatures so a third
party cannot forge state changes (booked calls, completed dials, refunds).

| ID | Statement | Constrains | Enforced by | Manual disprove |
| --- | --- | --- | --- | --- |
| `webhook.signature-required` | Vapi and Twilio webhook routes must reject unsigned/invalid payloads when verification is configured (`VAPI_WEBHOOK_SECRET` / `TWILIO_AUTH_TOKEN`). New webhook routes under `routes/` must import the matching verifier middleware. | `routes/vapi-webhooks.js`, `routes/twilio-voice-webhooks.js`, `middleware/vapi-webhook-verification.js` | policy, canary | `POST /webhooks/twilio-voice-inbound` without a valid `X-Twilio-Signature` (token configured) returns 403. `POST /webhooks/vapi` with `VAPI_WEBHOOK_SECRET` set and missing signature returns 401. |

## Domain: error envelope

Errors that reach the client must be JSON-shaped, not stack traces. This
prevents info leaks and keeps non-technical operators able to read errors
in the dashboard.

| ID | Statement | Constrains | Enforced by | Manual disprove |
| --- | --- | --- | --- | --- |
| `error.json-envelope` | 4xx/5xx responses must be `{ ok?: false, error: string }`. They must NOT include V8 stack frames (`at fnName (/path:line:col)`). | All routes | canary (uses `assertJsonErrorEnvelope`) | Trigger any 500 path; the body must be JSON, no stack frame text. |
| `error.cache-control-no-store` | Dashboard / admin reads must include `Cache-Control: no-store`. | Admin/dashboard `GET` routes | canary (uses `assertNoStoreCache`) | `curl -i` any admin endpoint; the `Cache-Control` header must contain `no-store`. |

## Domain: sequence

Multi-stage outbound sequences are **opt-in per tenant and per lead**: the tenant must have a valid enabled `outbound_sequence_json`, and each lead must carry an explicit opt-in signal in `leads.lead_dial_context_json`.
When enabled, stage advancement is **server-inferred** from structured fields; the next dial is always a **future** `call_queue` row (no inline Vapi dial from webhooks).

| ID | Statement | Constrains | Enforced by | Manual disprove |
| --- | --- | --- | --- | --- |
| `sequence.tenant-opt-in-required` | Sequence behavior runs only when `client.outboundSequence.enabled === true` and config passes `validateOutboundSequenceConfig`. Tenants without this flag behave like legacy single-call. | `lib/server-queue-workers.js`, `lib/instant-calling.js`, `lib/vapi-webhooks/process-webhook-payload.js` | canary | Create a tenant with `enabled: false`; observe no `stageId` in `call_queue.call_data` and no sequence DB rows for new leads. |
| `sequence.lead-opt-in-required` | Even for a sequence-enabled tenant, outbound leads default to `classic` unless the lead explicitly opts into multi-call via `lead_dial_context_json` (for example `outboundSequenceOptIn: true`). Tenant enablement alone must never auto-enroll every lead. | `lib/lead-dial-context.js`, `lib/outbound-sequence.js`, `lib/server-queue-workers.js`, `lib/lead-import-outbound.js` | canary | Use a sequence-enabled tenant and queue/import two otherwise identical leads, one with no opt-in flag and one with `outboundSequenceOptIn: true`. The unflagged lead must stay `classic`; only the flagged lead may use `sequence`. |
| `sequence.lead-enrollment-operator-api` | Operators may set or clear per-lead multi-call enrollment via `POST /api/clients/:clientKey/outbound-sequence/enrollment` (API key). Opt-out must persist `outboundSequenceOptIn: false` in `lead_dial_context_json` and stop any active sequence for that lead. Opt-in must fail when the tenant has no valid enabled sequence config. | `lib/outbound-sequence-enrollment.js`, `lib/lead-dial-context.js`, `routes/client-ops-mount.js`, `public/client-dashboard.html` | canary | Enroll then unenroll a lead from the dashboard/API; visibility shows `sequenceOptedIn` toggling; unenroll cancels active sequence rows. |
| `sequence.lead-enrollment-bulk-api` | Operators may enroll or unenroll up to 100 leads per request via `POST .../outbound-sequence/enrollment/bulk` with `leadPhones[]` and `enrolled`. Response includes per-phone results; partial success returns HTTP 207. Dashboard must expose multi-select in the sequence list and follow-up bulk actions. | `lib/outbound-sequence-enrollment.js`, `routes/client-ops-mount.js`, `public/client-dashboard.html` | canary | Select two leads in sequence window or follow-up queue, bulk enroll, then bulk unenroll; both phones flip `sequenceOptedIn`. |
| `sequence.enroll-queue-now-operator` | When `queueNow: true` on enroll (single or bulk), the server may enqueue the first sequence stage via `queueFirstSequenceStageForLead` with `triggerType: operator_sequence_enroll` and business-hours scheduling. Default enroll without `queueNow` must not auto-queue. Dashboard exposes an explicit checkbox. | `lib/outbound-sequence-enrollment.js`, `lib/outbound-sequence-queue-first.js`, `routes/client-ops-mount.js`, `public/client-dashboard.html` | canary | Enroll with `queueNow: false` — no new `call_queue` row. Repeat with `queueNow: true` — one pending row with `operator_sequence_enroll` and first `stageId`. |
| `sequence.bulk-stop-operator-api` | Operators may stop active sequences for up to 100 leads via `POST .../outbound-sequence/stop/bulk`. Each stop cancels future `sequence_next` rows and records operator stop handoff (same semantics as single stop). Dashboard sequence list exposes bulk Stop selected. | `lib/outbound-sequence-ops.js`, `routes/client-ops-mount.js`, `public/client-dashboard.html` | canary | Select two active sequence leads, bulk stop; both leave active state and pending `sequence_next` rows cancel. |
| `sequence.enrollable-leads-visibility` | Dashboard sequence window must list leads not opted into multi-call via `GET /outbound-sequence/:clientKey/enrollable-leads` (In sequence vs Not enrolled toggle). **`GET …/leads` (In sequence) must omit terminal `lead_sequence_state` rows unless the lead still has explicit multi-call opt-in**, or the row is still `status=active` (ops safety). Summary includes sampled enrollment counts. Sequence-state rows expose pending `sequence_next` queue hints and stuck hints where applicable. | `routes/outbound-sequence-visibility-mount.js`, `lib/outbound-sequence-state-list-include.js`, `public/client-dashboard.html` | canary | Toggle Not enrolled; only `sequenceOptedIn: false` leads appear. In sequence view: stopped/abandoned leads who unenrolled do not appear. Summary shows enrolled/not-enrolled counts. Active row with stale `updated_at` shows stuck badge. |
| `sequence.llm-per-lead-stage-script` | When `SEQUENCE_LLM_SCRIPTS=1` and `OPENAI_API_KEY` is set, each sequence dial must build `assistantOverrides.firstMessage` and system prompt via `lib/outbound-sequence-script-llm.js` using lead row + import dial context + prior stage structured data, falling back to static stage JSON on failure. Call metadata must include `sequenceScriptSource` (`llm` or `static`). | `lib/outbound-sequence-script-llm.js`, `lib/instant-calling.js` | canary | Enable env; dial enrolled lead; Vapi payload metadata shows `sequenceScriptSource: llm` and opener references lead company. Disable env → `static`. |
| `sequence.advance-only-when-required-filled` | The engine must not enqueue the next stage unless every `requiredFields` entry for the current stage is present and non-empty in structured data. | `lib/vapi-webhooks/process-webhook-payload.js`, `lib/outbound-sequence.js#isStageComplete` | canary | Send webhook with missing required field; no new `call_queue` row with `sequence_next`. |
| `sequence.no-skip-stages` | At most one stage transition per end-of-call webhook (no jumping from stage 1 to stage 3 in one event). | `lib/vapi-webhooks/process-webhook-payload.js` | canary | Complete stage 1 only; next queued row must reference stage 2 id, never stage 3. |
| `sequence.no-parallel-stages-per-lead` | At most one `pending` or `processing` `vapi_call` row per `(client_key, lead_phone)` while a sequence is active. | `lib/server-queue-workers.js`, `lib/vapi-webhooks/process-webhook-payload.js`, `db/domains/call-queue.js` | canary, invariant | Attempt double-enqueue; second insert must be rejected or deduped; invariant query for duplicate actives returns 0. |
| `sequence.no-new-vapi-call-sites` | `lib/outbound-sequence.js` must not contain `fetch('https://api.vapi.ai/call', …)`. Sequences enqueue only. | `lib/outbound-sequence.js` | policy, canary | `rg` the file for `api.vapi.ai/call`; expect zero. |
| `sequence.no-inline-stage-chaining` | After a stage completes, the next stage must be scheduled with `scheduled_for` strictly in the future (never `NOW()` equality from webhook path). | `lib/vapi-webhooks/process-webhook-payload.js`, `lib/outbound-sequence.js#computeNextStageScheduledFor` | canary | Observe `call_queue.scheduled_for > webhook_received_at` for `triggerType: sequence_next`. |
| `sequence.respects-business-hours` | Next-stage `scheduled_for` must be produced via `scheduleAtOptimalCallWindow` (same chokepoint as other dials). | `lib/outbound-sequence.js#computeNextStageScheduledFor` | canary | Disable business window; next slot still clamps to allowed outbound window. |
| `sequence.stage-config-validation` | Invalid `outbound_sequence_json` when `enabled: true` must not crash the server; `getValidatedOutboundSequence` returns null and the tenant falls back to legacy outbound. | `lib/outbound-sequence.js#validateOutboundSequenceConfig` | canary | Set malformed JSON with `enabled: true`; server boots; tenant dials as single-call. |
| `sequence.handoff-import-context-allowlist` | Sequence `vapi_webhook.sequence_completed` and `vapi_webhook.sequence_abandoned` handoffs may attach `qual._importContext`, but only from sanitized `leads.lead_dial_context_json` values and only for keys in tenant `handoffImportContextKeys` or the locked defaults `crmCampaign` / `laneHint`. The handoff row must never embed the full raw lead dial context or reserved sequence-owned keys. | `lib/outbound-sequence.js`, `lib/vapi-webhooks/outbound-sequence-webhook.js`, `lib/lead-dial-context.js` | canary | Store lead dial context with allowed, extra, and reserved keys; complete or abandon a sequence. The saved handoff row should include only the allow-listed keys under `qual._importContext`, with no raw blob or reserved key leakage. |
| `sequence.operator-stop-dismiss-audited` | Admin/operator stop and salvage-dismiss actions must be explicit mutations: stopping a lead cancels only future `sequence_next` queue rows for that lead, marks the sequence abandoned, and records handoff source `operator.sequence_stopped` so dashboard filters/reporting can separate operator-stopped rows from system-abandoned salvage. Dismissing abandoned salvage stamps `qual._salvageDismissedAt` / `qual._salvageDismissedBy` so the row leaves the abandoned-system cohort but remains visible in `all`. Both actions must append a bounded FIFO `qual._opsAudit` trail. | `lib/outbound-sequence-ops.js`, `routes/client-ops-mount.js`, `lib/dashboard-follow-up-filters.js`, `public/client-dashboard.html` | canary | Stop an active sequence from the operator UI/API; future `sequence_next` rows for that phone are cancelled, the sequence row becomes abandoned, and the dashboard classifies it under `stopped` instead of `abandoned`. Then dismiss an abandoned salvage row; it disappears from the abandoned-system filter, remains in `all`, and the handoff JSON shows bounded `_opsAudit` plus `_salvageDismissedAt`. |
| `sequence.kill-switch-honored` | When `OUTBOUND_SEQUENCE_DISABLED=1`, no tenant uses sequence behavior regardless of JSON. | `lib/outbound-sequence.js`, queuer, webhook, dial path | canary | Set env; observe legacy payloads only. |
| `sequence.bounded-attempts-per-stage` | `attempts_in_stage` must never exceed `stage.maxAttemptsInStage` for the active stage. | `lib/vapi-webhooks/process-webhook-payload.js`, `lead_sequence_state` | invariant | Force incomplete webhooks; after cap, `status='abandoned'`. Ops invariant flags active rows where DB counters exceed tenant JSON caps. |
| `sequence.bounded-total-dials-per-lead` | `attempts_total` must not exceed `maxTotalDialsPerLead`; when hit, sequence abandons and handoff is written. | `lib/vapi-webhooks/process-webhook-payload.js` | canary | Set cap to 1; second completed dial abandons without new queue row. |
| `sequence.bounded-duration` | When `now - started_at` exceeds `maxSequenceDurationDays`, sequence abandons. | `lib/vapi-webhooks/process-webhook-payload.js` | canary | Backdate `started_at` in test DB; next webhook abandons. |
| `sequence.stale-active-sequence` | Active `lead_sequence_state` with `updated_at` older than 7 days is surfaced as an ops invariant (likely stuck worker or missed webhooks). | `lead_sequence_state`, `lib/ops-invariants.js` | invariant | Force `status=active` and `updated_at` 8 days ago; cron invariant count rises. |

## Domain: ops

Operational safety rules that prevent “green CI, broken prod” incidents.
These primarily guard boot-time wiring and other high-blast-radius regressions.

| ID | Statement | Constrains | Enforced by | Manual disprove |
| --- | --- | --- | --- | --- |
| `ops.server-boot-wiring-no-tdz` | `server.js` must not throw boot-time `ReferenceError: Cannot access '<name>' before initialization` due to passing undeclared `const` values into `mountApi(...)` / route wiring. Critical wiring constants must be defined before `mountApi(app, { ... })`. | `server.js`, `app/mount-api.js` | policy | Search `server.js` for `mountApi(app, {`. Verify `const DASHBOARD_ACTIVITY_TZ`, `const defaultSmsClient`, and Twilio env constants appear **above** that call (not below). |
| `ops.server-helpers-no-new-vapi-call-sites` | Helpers extracted from `server.js` (`lib/server-*.js`, `lib/google-sheets-append.js`) are wiring/refactors only: they must not introduce new outbound `fetch('https://api.vapi.ai/call', …)` call sites (same constraint as `dial.no-direct-vapi-outside-worker`). | `lib/server-input-validation.js`, `lib/server-call-resilience.js`, `lib/server-assistant-scheduling.js`, `lib/server-files-inbound-templates.js`, `lib/server-reminders-runner.js`, `lib/server-http-context.js`, `lib/server-demo-generators.js`, `lib/server-runtime-helpers.js`, `lib/google-sheets-append.js` | policy | Run `rg "fetch\\(.*api\\.vapi\\.ai/call"` under `lib/server-*.js` and `lib/google-sheets-append.js`; expect zero matches. |
| `ops.automation-smoke-healthy-when-armed` | `GET /automation-smoke` is a GREEN-tier self-heal verification arm. When `AUTOMATION_SMOKE_ENABLED=true` and Sentry is configured, it must return a 2xx JSON success envelope instead of intentionally throwing. | `lib/automation-smoke-probe.js`, `routes/health-probes-mount.js` | route contract (`tests/routes/health-probes-mount.contract.test.js`) | With `AUTOMATION_SMOKE_ENABLED=true` and Sentry configured, request `/automation-smoke`; response should be `{ ok: true, message: 'automation smoke probe healthy' }`, not a 500. |
| `ops.heal-test-healthy-when-armed` | `GET /heal-test` is a gated self-heal test arm. When `HEAL_TEST_ENABLED=true` and Sentry is configured, it must return a 2xx JSON success envelope instead of intentionally throwing a null dereference. | `lib/heal-test-probe.js`, `routes/health-probes-mount.js` | route contract (`tests/routes/health-probes-mount.contract.test.js`) | With `HEAL_TEST_ENABLED=true` and Sentry configured, request `/heal-test`; response should be `{ ok: true, message: 'heal test probe healthy' }`, not a 500. |
| `ops.pg-pool-idle-error-nonfatal` | Unexpected idle PG client disconnects must be logged by the shared pool instead of becoming uncaught `error` events that shut down the web service. Query failures still surface normally so `/health/lb` can return 503 when the database is unavailable. | `db/connection.js`, `routes/health-and-diagnostics.js#/health/lb` | unit (`tests/unit/db/connection.test.js`), route contract (`tests/routes/health-and-diagnostics.contract.test.js`) | During a transient database idle-client disconnect, uptime monitors should not see a process restart solely from an unhandled pool `error`; `/health/lb` should continue to return 200 when a fresh DB query succeeds or 503 when it does not. |

## How to add a new rule

1. Pick a stable ID (`<domain>.<short-kebab-name>`).
2. Add the row above with statement / constrains / enforced-by / manual disprove.
3. Wire at least one enforcement:
   - **policy** -> add a rule entry in [scripts/check-policy.mjs](../scripts/check-policy.mjs).
   - **canary** -> add or extend a file in `tests/canaries/`.
   - **invariant** -> add a check in [lib/ops-invariants.js](../lib/ops-invariants.js).
4. Run `npm run test:ci` locally; it now runs `check:policy` and `test:canaries`.

For background, see the plan at
`.cursor/plans/behavioral-intent-gates_*.plan.md`.
