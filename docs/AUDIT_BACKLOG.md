# Audit backlog (ranked)

This backlog is organized for **PR-ready remediation**. Items are written to map to existing Intent IDs in `docs/INTENT.md` when applicable.

Severity scale:
- **P0**: can break production, cause billing incidents, or violate security boundaries
- **P1**: likely incident/regression or material spend risk
- **P2**: correctness/ops debt; medium risk
- **P3**: cleanup/maintainability

## Reliability & correctness

### P0 — Postgres `call_queue` completion constraint likely breaks `request-queue` processing

- **Area**: queue/worker correctness
- **Files**:
  - `db.js` adds DB constraint `call_queue_completed_requires_call_id` on `call_queue` (applies to **all rows**, not only `vapi_call`)
  - `lib/request-queue.js` sets `status='completed'` for `call_queue` rows of types like `sms_send`, `lead_import`, etc, **without setting `initiated_call_id`**
- **Why this matters**:
  - On Postgres, completing any `call_queue` row with a null `initiated_call_id` should violate the constraint and error.\n
  - That can stall the `request-queue` cron lane (`lib/scheduled-jobs.js`: retry → request-queue) and create persistent backlogs.
- **Related Intent ID**: `queue.no-phantom-completed` (the intent is scoped to `vapi_call`, but the DB constraint appears broader than the intent)
- **How to verify (manual)**:
  - On a Postgres env with the constraint present, enqueue a non-`vapi_call` row via `lib/request-queue.js#enqueueRequest` and run `processQueue()`; observe whether the completion `UPDATE call_queue SET status='completed'...` errors.
- **Likely fix direction (PR-ready)**:
  - Change the DB check constraint to only apply to `call_type='vapi_call'`, e.g. `CHECK (status <> 'completed' OR call_type <> 'vapi_call' OR initiated_call_id IS NOT NULL)`.\n
  - Add/extend a contract/canary to cover “non-vapi request-queue rows can complete” and “vapi_call cannot complete without initiated_call_id”.

### P0 — `request-queue` retry loop never increments attempts (can reschedule forever)

- **Area**: retry/backpressure correctness
- **Files**:
  - `lib/request-queue.js` uses `const retryAttempt = (item.retry_attempt || 0) + 1` to decide whether to retry.\n
  - `call_queue` schema (in `db.js`) does **not** define a `retry_attempt` column on `call_queue`.
- **Why this matters**:
  - `item.retry_attempt` will always be `undefined` for `call_queue` rows → `retryAttempt` is always `1` → always `< 3`.\n
  - That means a failing request-queue job can become a **permanent pending loop** (rescheduled every ~1 minute), inflating backlog and cron load.
- **Related Intent IDs**: indirectly affects `billing.no-burst-dial` (load amplification) and queue health; should likely get its own intent if request-queue is a billing-affecting surface.
- **How to verify (manual)**:
  - Enqueue a request-queue job guaranteed to fail (e.g. missing required payload); observe it repeatedly re-run without ever transitioning to `failed`.
- **Likely fix direction (PR-ready)**:
  - Add a dedicated retry counter for non-vapi `call_queue` types (new column) or store retry attempt in `call_data` and update it atomically.\n
  - Add a canary that forces a request-queue item to fail repeatedly and asserts it eventually hits `failed` (bounded retries).

### P1 — Legacy "instant import dialing" path still exists and can bypass routing distribution — RESOLVED in PR-9

- **Area**: dial spend control / burst risk
- **Files**:
  - `lib/lead-import-outbound.js#processLeadImportOutboundCalls` previously called `lib/instant-calling.js#processCallQueue` and dialed imports in a burst.
  - The primary import path (`lib/lead-import-outbound.js#runOutboundCallsForImportedLeads` and `routes/import-leads.js`) is the safe path and enqueues via `scheduleAtOptimalCallWindow`.
- **Resolution (PR-9)**:
  - `processLeadImportOutboundCalls` now throws unless `ALLOW_LEGACY_INSTANT_IMPORT_DIAL=1` is set; default behavior is hard-disabled with a descriptive error.
  - Updated the function to call the renamed `dialLeadsNowBatch` (see next item).

### P1 — Duplicate "call queue processor" concepts (DB-backed vs in-memory list dialing) increases regression risk — RESOLVED in PR-9

- **Area**: maintainability leading to correctness issues
- **Files**:
  - `server.js#processCallQueue` is the DB-backed `call_queue` worker (kept).
  - `lib/instant-calling.js#processCallQueue` was the in-memory batch dialer.
- **Resolution (PR-9)**:
  - Renamed `lib/instant-calling.js#processCallQueue` → `lib/instant-calling.js#dialLeadsNowBatch`. Updated callers (`lib/lead-import-outbound.js`) and tests (`tests/unit/lib/instant-calling.test.js`, `tests/lib/lead-import-outbound.test.js`).
  - Added new policy gate `dial.no-instant-calling-process-call-queue-import` in `scripts/check-policy.mjs` and `docs/INTENT.md` that forbids any new import of `processCallQueue` from `lib/instant-calling.js` (static or dynamic), so the rename cannot be quietly reversed.

### P2 — Multi-instance concurrency slot release is an ops footgun — INVARIANT ADDED in PR-9

- **Area**: throughput / stuck dial prevention
- **File**: `lib/instant-calling.js#releaseVapiSlot` supports `VAPI_CONCURRENCY_RELEASE_UNKNOWN=1` to release slots when a webhook arrives on a different instance.
- **Why this matters**:
  - Helpful for multi-instance webhook routing mismatches, but can also under-count concurrency and allow oversubscription/spend spikes if enabled incorrectly.
  - This needs an explicit operational playbook and a stronger invariant.
- **Related Intent IDs**: `queue.concurrency-cap`, `billing.no-burst-dial`
- **Resolution (PR-9, partial)**:
  - `lib/instant-calling.js#_releaseOneSlot` now increments `vapiSlotUnderflowCount` when called with `currentVapiCalls === 0` (release without matching acquire) and `vapiSlotUnknownReleaseCount` when the `VAPI_CONCURRENCY_RELEASE_UNKNOWN=1` escape hatch fires.
  - `lib/ops-invariants.js` reads `getVapiConcurrencyState()` and emits `vapi_concurrency_underflow` / `vapi_concurrency_unknown_release` problems mapped to `queue.concurrency-cap` so the cron alert fires before spend amplifies.
  - Caveat: counters are process-local. Multi-instance deployments still need a DB-backed slot lease (tracked separately) — the invariant only catches single-instance regressions.

## Security, compliance, and tenant safety

### P0 — `routes/clients-api.js` appears unauthenticated and can leak tenant configuration

- **Area**: tenant isolation / admin auth
- **File**: `routes/clients-api.js`
- **Why this matters**:
  - The router exposes `GET /api/clients` and `GET /api/clients/:key` without `authenticateApiKey` / API key checks.\n
  - Depending on what `getFullClient()` returns, this can expose sensitive tenant configuration (and at minimum violates the repo’s `tenant.auth-required-on-admin` intent).
- **Related Intent IDs**: `tenant.auth-required-on-admin`, `tenant.cross-tenant-isolation`
- **How to verify (manual)**:
  - Hit `/api/clients/<someClientKey>` without auth headers; if it returns 200, it’s a confirmed leak.
- **Likely fix direction (PR-ready)**:
  - Gate the entire router with `authenticateApiKey` and enforce tenant access.\n
  - Add/extend a route contract test using `assertAuthRequired` and `assertTenantIsolation` for `/api/clients/:key`.

### P0 — `routes/tools-mount.js` can be abused to write to Google Sheets (no auth + weak tenant resolution)

- **Area**: webhook/tooling attack surface
- **File**: `routes/tools-mount.js`
- **Why this matters**:
  - The tool endpoint logs full `req.body` and accepts a `tenantKey` from user-controlled payload.\n
  - When the tenant cannot be resolved, it falls back to a default (`logistics_client`) and continues, which enables unauthorized writes if the route is publicly reachable.\n
  - This is a direct integrity risk for client-facing operational data (sheets) and may leak PII in logs.
- **Related Intent IDs**: adjacent to `webhook.signature-required` and `tenant.cross-tenant-isolation` (but tools routes aren’t currently covered by that intent row)
- **Likely fix direction (PR-ready)**:
  - Require provider signature verification for tool calls (if invoked by Vapi) or require `X-API-Key` + tenant isolation.\n
  - Remove/fence the “fallback to default tenant” behavior.\n
  - Add a policy gate: tool endpoints must never accept `tenantKey` from request body without authentication.

### P1 — `requireTenantAccess` middleware checks the wrong param name for many routes

- **Area**: tenant boundary correctness
- **File**: `middleware/security.js#requireTenantAccess`
- **Why this matters**:
  - The middleware reads `req.params.tenantKey || req.body.clientKey`.\n
  - Many routers use `:clientKey` path params (not `:tenantKey`) — which means tenant isolation enforcement can be accidentally skipped or can incorrectly 400.\n
  - This is both a correctness issue and a security issue (depends on how routes are wired).
- **Related Intent IDs**: `tenant.cross-tenant-isolation`
- **Likely fix direction (PR-ready)**:
  - Accept `req.params.clientKey` as well, and add contract tests for at least one route using `requireTenantAccess` with `:clientKey`.

### P2 — Excessive PII logging in public-facing routes and tool/webhook handlers

- **Area**: privacy/compliance
- **Why this matters**:
  - Several routes log phone numbers, full webhook bodies, and tool payloads. In production logs, this can be a compliance and incident response issue.\n
  - Example: `routes/tools-mount.js` logs `JSON.stringify(req.body, null, 2)`.
- **Likely fix direction (PR-ready)**:
  - Introduce a log scrubber utility to redact phone numbers/emails and large payloads.\n
  - Add a policy gate for known sensitive routes: forbid logging full `req.body` unless `NODE_ENV !== 'production'`.

## Performance, scaling, and resource safety

### P1 — `optimizedQuery` timeout timers are never cleared (can accumulate under load)

- **Area**: performance + resource safety
- **File**: `lib/query-optimizer.js#optimizedQuery`
- **Why this matters**:
  - The implementation uses `Promise.race([queryPromise, timeoutPromise])` but does not cancel/clear the timeout when the query completes.\n
  - Under high query volume, this creates many pending timers that will all eventually fire, increasing CPU wakeups and memory pressure.\n
  - It can also keep the process alive longer than expected (timers are “live” handles).
- **Likely fix direction (PR-ready)**:
  - Use `AbortController` (for drivers that support it) or capture the timeout id and `clearTimeout()` once the query resolves/rejects.\n
  - Consider `.unref()` if the timer must exist but shouldn’t keep the process alive.\n
  - Add a unit test that ensures no leaked handles when calling `optimizedQuery` repeatedly (or rely on `npm run test:detect-leaks` lane).

### P2 — Query monitoring appears partially broken / duplicated

- **Area**: observability + perf tooling
- **Files**:
  - `lib/query-monitor.js` updates query metrics via `updateQueryPerformance()` which calls `query(...)` without importing/receiving it.\n
  - There are multiple overlapping systems: `lib/query-monitor.js`, `lib/query-performance-tracker.js`, `lib/performance-monitor.js`, `lib/monitoring.js`.
- **Why this matters**:
  - Broken monitoring means “slow query” alerts won’t be trustworthy.\n
  - Duplicated monitoring increases maintenance and makes it unclear which system is the source of truth.
- **Likely fix direction (PR-ready)**:
  - Pick one system (prefer the more production-hardened one with cross-process throttle: `lib/query-performance-tracker.js`).\n
  - Either delete or refactor `lib/query-monitor.js` to accept `queryFn` for writes as well, and add tests to ensure it records metrics.

### P2 — Large admin/dashboard queries likely need explicit pagination and selective columns

- **Area**: DB load / latency
- **Where**:
  - Admin and dashboard routes with `LEFT JOIN LATERAL` and large joins (e.g. `routes/demo-dashboard.js`, `routes/admin-*.js`) appear designed for “rich” views.\n
  - Some endpoints use broad selects and complex joins; ensure they all have reasonable LIMIT/OFFSET and avoid `SELECT *` where possible.
- **Likely fix direction (PR-ready)**:
  - Add explicit pagination parameters with server-side caps.\n
  - For the top 2–3 slow endpoints (as measured by `query-performance-tracker`), add purpose-built composite indexes and reduce row payloads.

