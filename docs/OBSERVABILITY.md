# Observability: source of truth

The codebase had overlapping “monitoring” helpers historically; **`lib/query-monitor.js` was removed** during the hygiene burndown. Use this split:

## Slow queries / SQL statement timing

**Canonical:** [`lib/query-performance-tracker.js`](../lib/query-performance-tracker.js)

- Aggregates per SQL hash (avg/max duration, call counts).
- Consumed by [`lib/monitoring-dashboard.js`](../lib/monitoring-dashboard.js) for slow-query style stats.

Prefer recording slow paths here when adding new high-volume queries.

## HTTP request latency / route-level performance

**Canonical:** [`lib/performance-monitor.js`](../lib/performance-monitor.js)

- Express middleware (`performanceMiddleware`, `getPerformanceMonitor`).
- Used by [`server.js`](../server.js), [`routes/monitoring.js`](../routes/monitoring.js), [`routes/ops.js`](../routes/ops.js).

This is **not** a substitute for DB query tracking; it measures wall time around handlers.

## Other modules

- [`lib/monitoring.js`](../lib/monitoring.js), [`lib/health-monitor.js`](../lib/health-monitor.js), [`lib/error-monitoring.js`](../lib/error-monitoring.js) — health, alerts, and error pipelines; use where already wired.
- [`lib/structured-logger.js`](../lib/structured-logger.js) — structured logs where adopted.

When adding a new metric, pick **either** query-performance **or** HTTP performance depending on whether the signal is DB-bound or handler-bound; avoid introducing a third parallel tracker.
