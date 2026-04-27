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
| `queue.retry-backlog-bounded` | `retry_queue` rows whose `scheduled_for <= NOW()` must stay below `OPS_INVARIANTS_RETRY_DUE_THRESHOLD` (default 50). Larger means workers aren't draining. | `lib/follow-up-processor.js`, retry worker | invariant | `lib/ops-invariants.js#retryDue` returns < threshold. |

## Domain: tenant

Tom is the anchor client and lives behind the tenant key `d2d-xpress-tom`.
Customer-facing surfaces (Vapi payloads, transcripts, dashboard copy) must
never carry the internal key — only display names. Cross-tenant access
must always 403, never silently 200.

| ID | Statement | Constrains | Enforced by | Manual disprove |
| --- | --- | --- | --- | --- |
| `tenant.no-internal-key-leak` | The internal tenant key `d2d-xpress-tom` (and any other internal client_key) MUST NOT appear in Vapi payload `metadata`, transcripts, customer-facing copy, or response bodies. Use `displayName` instead. | `routes/**`, `lib/instant-calling.js`, `lib/follow-up-processor.js`, prompt builders | policy (allow-listed: `db.js`, `tests/`, `scripts/`, `docs/`), canary | `assertNoTenantKeyLeak(res, 'd2d-xpress-tom')` on every customer-facing response. |
| `tenant.cross-tenant-isolation` | Authenticated requests with a `clientKey` the caller does not own must return 403, never silent 200. | `routes/**` admin/client surfaces | canary (uses `assertTenantIsolation`) | Authenticate as tenant A, request tenant B's resources; response must be 401/403. |
| `tenant.auth-required-on-admin` | Admin/client endpoints must return 401 when `X-API-Key` is missing or invalid. | `routes/admin-*.js`, `routes/client-*.js` | canary (uses `assertAuthRequired`) | Send a request without `X-API-Key`; response must be 401 with a JSON error envelope. |

## Domain: billing

Spend on Vapi credits is bounded by a small set of measurable behaviors:
spread (no bursts), idle-call control (voicemail/no-answer cutoffs), and
respecting the wallet check before placing a call.

| ID | Statement | Constrains | Enforced by | Manual disprove |
| --- | --- | --- | --- | --- |
| `billing.no-burst-dial` | Across all tenants, the count of `calls` rows with `created_at > NOW() - 5m` divided by distinct minute buckets must stay below the configured threshold. A burst usually indicates an unthrottled import or a stuck retry loop. | queue worker, all enqueue call sites | invariant | `lib/ops-invariants.js#dial_burst_detected` returns 0. |
| `billing.wallet-check-before-dial` | The queue worker must check Vapi wallet balance / concurrency slot before dialing. If the wallet is depleted, the row stays `pending` (not `failed`/`completed`). | `lib/instant-calling.js` | canary | Mock a wallet-empty response; the row should remain `pending` and not consume a Vapi credit. |
| `billing.idle-call-cutoffs` | All Vapi assistants must be configured with `endCallOnSilence`, `endCallOnVoicemail`, and a `maxDurationSeconds` cap to prevent runaway idle calls. | Vapi assistant config / payload builder | canary | Inspect a generated Vapi payload; verify the three caps are present and within sane bounds. |

## Domain: error envelope

Errors that reach the client must be JSON-shaped, not stack traces. This
prevents info leaks and keeps non-technical operators able to read errors
in the dashboard.

| ID | Statement | Constrains | Enforced by | Manual disprove |
| --- | --- | --- | --- | --- |
| `error.json-envelope` | 4xx/5xx responses must be `{ ok?: false, error: string }`. They must NOT include V8 stack frames (`at fnName (/path:line:col)`). | All routes | canary (uses `assertJsonErrorEnvelope`) | Trigger any 500 path; the body must be JSON, no stack frame text. |
| `error.cache-control-no-store` | Dashboard / admin reads must include `Cache-Control: no-store`. | Admin/dashboard `GET` routes | canary (uses `assertNoStoreCache`) | `curl -i` any admin endpoint; the `Cache-Control` header must contain `no-store`. |

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
