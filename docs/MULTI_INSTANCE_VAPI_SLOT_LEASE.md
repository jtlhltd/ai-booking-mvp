# Multi-instance Vapi concurrency (implementation)

## Problem (historical)

Multiple Node processes each ran an in-process `acquireVapiSlot` / `releaseVapiSlot` counter, so global Vapi concurrency was not coordinated across hosts.

## Current behavior (PR-13)

1. **Table** `vapi_slot_leases` — Postgres via [migrations/add-vapi-slot-leases-table.sql](../migrations/add-vapi-slot-leases-table.sql); SQLite DDL applied in [db.js](../db.js) `initSqlite()` from [lib/vapi-slot-lease.js](../lib/vapi-slot-lease.js) `SQLITE_VAPI_SLOT_LEASES_DDL`.
2. **Acquire** — [lib/vapi-slot-lease.js](../lib/vapi-slot-lease.js) `tryAcquireDbLeaseOnce()`: Postgres uses `pg_advisory_xact_lock` + `COUNT(*)` + `INSERT`; SQLite uses `BEGIN IMMEDIATE` transaction + same logic.
3. **Release** — `DELETE` by `call_id` (webhooks on any instance) or by `lease_id` (abort before Vapi returns an id).
4. **Link** — After Vapi returns `id`, `linkDbLeaseToCallId(leaseId, callId)` sets `call_id` on the row.
5. **TTL** — `expires_at` defaults from `VAPI_SLOT_LEASE_TTL_MS` (default 45 minutes). Cron reap: [lib/scheduled-jobs.js](../lib/scheduled-jobs.js) `7-59/10 * * * *` calls `reapExpiredDbLeases()`.
6. **Intent** — `queue.cross-instance-concurrency-cap` in [INTENT.md](INTENT.md); ops invariant `vapi_slot_lease_over_cap` in [lib/ops-invariants.js](../lib/ops-invariants.js); canary [tests/canaries/cross-instance-concurrency-cap.canary.test.js](../tests/canaries/cross-instance-concurrency-cap.canary.test.js).

## Environment

| Variable | Meaning |
| -------- | ------- |
| `VAPI_DB_SLOT_LEASE` | `0` / `false` / `no` — force in-process limiter only. `1` / `true` — force DB leases (tests). **Unset**: DB leases in non-Jest; in Jest workers, memory limiter unless set to `1`. |
| `VAPI_INSTANCE_ID` | Optional stable id per process for debugging (`instance_id` column). |
| `VAPI_SLOT_LEASE_TTL_MS` | Lease row lifetime (must cover worst-case call length). |

## Jest

Workers set `JEST_WORKER_ID`; without `VAPI_DB_SLOT_LEASE=1`, unit/canary tests keep the **memory** limiter so `db.js` does not need a real `vapi_slot_leases` table.
