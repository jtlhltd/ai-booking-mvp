# Multi-instance Vapi concurrency (deferred epic)

## Problem

[`lib/instant-calling.js`](../lib/instant-calling.js) uses **in-process** counters for `acquireVapiSlot` / `releaseVapiSlot`. Each Node process has its own view of “how many Vapi calls are in flight.”

That is correct for **single-instance** deployments. With **multiple** app instances behind a load balancer:

- Concurrent dial caps do not coordinate across hosts → risk of **oversubscription** (too many simultaneous `fetch` to Vapi).
- Webhooks may land on a different instance than the one that acquired the slot → `VAPI_CONCURRENCY_RELEASE_UNKNOWN=1` is an operational escape hatch; misuse can **under-count** slots (see [`lib/ops-invariants.js`](../lib/ops-invariants.js) signals `vapi_concurrency_underflow` / `vapi_concurrency_unknown_release`).

Process-local invariants in ops-invariants **cannot** detect cross-host drift.

## Direction (when horizontal scaling is required)

1. **DB-backed lease table** (or Redis with TTL): acquire increments a row keyed by `deployment_id` or global singleton; release decrements; webhook handlers use the same store.
2. **Short TTL + stale recovery**: if a worker dies, leases expire so slots are not stuck forever.
3. **Intent + gates**: extend `queue.concurrency-cap` / `billing.no-burst-dial` with a new intent row for cross-instance cap; add canary or invariant that compares in-flight leases to `VAPI_MAX_CONCURRENT` across the fleet (where measurable).

## Out of scope for the audit backlog closure

No migration or worker changes are implemented here; this document anchors the epic for a future PR.
