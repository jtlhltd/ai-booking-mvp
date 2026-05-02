# Hygiene pass — explicit residual and deferrals

This file answers “what’s **known** left?” after an exhaustive hygiene pass—not “nothing could ever improve.”

## Deferred by product / architecture

No open deferrals in this bucket (multi-instance Vapi slot lease **resolved** in PR-13 — [MULTI_INSTANCE_VAPI_SLOT_LEASE.md](MULTI_INSTANCE_VAPI_SLOT_LEASE.md), [AUDIT_BACKLOG.md](AUDIT_BACKLOG.md)).

## Deferred by upstream / tooling

None currently. **PR-15:** `node-cron@4` + `googleapis@171` cleared production `uuid` moderate advisories; `npm run audit:ci` (`npm audit --omit=dev --audit-level=moderate`) runs inside `npm run test:ci`.

## Monitoring-first (not guesswork)

| Item | Reason |
|------|--------|
| **P2 heavy reads — extra indexes** | Only add composite indexes or stricter pagination when [lib/query-performance-tracker.js](lib/query-performance-tracker.js) / alerts show repeat offenders; see [AUDIT_BACKLOG.md](AUDIT_BACKLOG.md) OPEN P2. |

## Large files (ongoing burndown, not blocking)

| Item | Notes |
|------|--------|
| **`server.js` ~6k lines** | Wiring + many helpers; continue extracting pure clusters to `lib/*` per [HYGIENE.md](HYGIENE.md). |
| **`db.js` ~4k lines** | Continue `db/*.js` siblings with contract tests. |

## Lint warnings

**PR-17:** `npm run lint` uses `eslint . --max-warnings 0` (same gate as `npm run test:ci`). `no-useless-escape` is off globally (high churn / low signal); other rules remain strict.

## Verification commands

After changes: `npm run test:ci`, `npm run test:route-inventory`, `npm run test:server-inline-inventory`.
