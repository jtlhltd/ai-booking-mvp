# Audit backlog (ranked)

This file tracks **residual** risk and **deferred** work. Items that are fully fixed in code are kept as **RESOLVED** with pointers so we do not re-audit the same issues.

For behavioral contracts, see [INTENT.md](INTENT.md). For the hygiene burndown index, see [HYGIENE.md](HYGIENE.md).

**Severity scale:** P0 (prod/security/billing) → P3 (maintainability).

---

## OPEN — still actionable

### P2 — Heavy dashboard / admin reads

- **Status**: [routes/demo-dashboard.js](../routes/demo-dashboard.js) `handleDemoDashboard` accepts optional `leadsLimit` and `callsFeedLimit` query params with **server-enforced caps** (see handler). [routes/admin-clients.js](../routes/admin-clients.js) `GET /client/:clientKey` accepts `leadsLimit` / `callsLimit` with caps. [routes/leads-portal-mount.js](../routes/leads-portal-mount.js) clamps `GET /api/leads` `limit`. [routes/clients-api.js](../routes/clients-api.js) admin `GET /` uses bounded `limit` / `offset` over `listFullClients()`.
- **Remaining**: Further pagination/caps or composite indexes as **measured** slow queries appear in [lib/query-performance-tracker.js](../lib/query-performance-tracker.js) (evidence-driven).

---

## DEFERRED — epic / product decision

### Multi-instance Vapi concurrency (DB-backed slot lease)

- **Issue**: In-process slot counters in `lib/instant-calling.js` do not coordinate across hosts; `VAPI_CONCURRENCY_RELEASE_UNKNOWN` is an operational escape hatch (see [MULTI_INSTANCE_VAPI_SLOT_LEASE.md](MULTI_INSTANCE_VAPI_SLOT_LEASE.md)).
- **Intent IDs**: Extends `queue.concurrency-cap`, `billing.no-burst-dial`.
- **Next**: Design + migration + INTENT/canaries when horizontal scaling is required.

---

## RESOLVED — reference only

### P0 — Postgres `call_queue` completion vs `request-queue`

- **Resolution**: Constraint is scoped to `vapi_call` only:
  `CHECK (status <> 'completed' OR call_type <> 'vapi_call' OR initiated_call_id IS NOT NULL)` ([db.js](../db.js)). Non–`vapi_call` rows may complete without `initiated_call_id`.
- **Intent**: `queue.no-phantom-completed`.

### P0 — `request-queue` retries not persisted

- **Resolution**: Column `call_queue.retry_attempt`; [lib/request-queue.js](../lib/request-queue.js) writes incrementing attempts and fails after bounded retries. Canary + INTENT `queue.request-queue-retries-bounded`.

### P1 — Legacy instant import burst dial / duplicate `processCallQueue` name

- **Resolution**: PR-9 — `ALLOW_LEGACY_INSTANT_IMPORT_DIAL`, rename to `dialLeadsNowBatch`, policy `dial.no-instant-calling-process-call-queue-import`.

### P2 — Multi-instance slot release footgun (partial)

- **Resolution**: PR-9 — counters + `lib/ops-invariants.js` signals. Full multi-instance fix deferred above.

### P0 — `routes/clients-api.js` unauthenticated

- **Resolution**: `router.use(authenticateApiKey)` ([routes/clients-api.js](../routes/clients-api.js)).

### P0 — `routes/tools-mount.js` unauthenticated / default tenant

- **Resolution**: `authOrSignature`, required `tenantKey`, `canActOnTenant`; INTENT `tools.auth-required`.

### P1 — `requireTenantAccess` param names

- **Resolution**: Reads `tenantKey`, `clientKey`, `key`, query/body fallbacks ([middleware/security.js](../middleware/security.js)).

### P2 — PII logging / log scrubber

- **Resolution**: `lib/log-scrubber.js`; ongoing route sweep + policy for pretty-json body logging.

### P2 — Route payload logging hygiene (policy closure)

- **Resolution**: CI policy gates in [scripts/check-policy.mjs](../scripts/check-policy.mjs): `privacy.no-pretty-json-req-body`, `privacy.no-bare-req-body-console-arg` (see [INTENT.md](INTENT.md) Domain: privacy). Vapi webhook middleware logs scrubbed payloads on error paths ([routes/vapi-webhooks.js](../routes/vapi-webhooks.js)).
- **Ongoing**: New routes should use `scrubBody` or keys-only for payload logs; test-only mounts stay non-production or scrubbed.

### P3 — SQLite vs Postgres queue invariants

- **Resolution**: SQLite `call_queue` enforces the same phantom-completion rule as Postgres via inline `CHECK` + idempotent on-disk migration in [db.js](../db.js) (`migrateSqliteCallQueuePhantomConstraint`). CI canary: [tests/canaries/sqlite-call-queue-phantom-check.canary.test.js](../tests/canaries/sqlite-call-queue-phantom-check.canary.test.js) (asserts DDL + migration symbols stay in **db.js**).

### P1 — `optimizedQuery` timer leak

- **Resolution**: `clearTimeout` in `finally` + `.unref()` ([lib/query-optimizer.js](../lib/query-optimizer.js)).

### P2 — Broken `lib/query-monitor.js`

- **Resolution**: Module removed; use [OBSERVABILITY.md](OBSERVABILITY.md) for SSOT split.

### P2 — Postgres `NOT VALID` constraint

- **Resolution**: Startup migration repairs phantom `vapi_call` completed rows without `initiated_call_id`, then `VALIDATE CONSTRAINT` when still invalid ([db.js](../db.js)).
