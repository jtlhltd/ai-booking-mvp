# Exhaustive hygiene queue (working list)

Single checklist derived from [ENTRYPOINT_BURNDOWN.md](ENTRYPOINT_BURNDOWN.md), [AUDIT_BACKLOG.md](AUDIT_BACKLOG.md), god-file size, `npm audit`, and lint posture. Items are **actionable** or **explicitly deferred** with a reason.

**Line budgets (snapshot):** `server.js` ~5960 lines, `db.js` ~4270 lines — burndown is ongoing, not a single PR.

## Entrypoint / god-file burndown

| Item | Status | Notes |
|------|--------|--------|
| Pure helpers in `server.js` → `lib/*` | In progress | Includes `lib/cost-optimization-recommendations.js`, `lib/error-retry-policy.js` (this pass); pattern: [HYGIENE.md](HYGIENE.md); update [AUDIT_MAP.md](AUDIT_MAP.md) |
| `db.js` → `db/*.js` (`query` first arg) | Ongoing | See existing `db/cost-budget-tracking.js`, `db/analytics-events.js` |
| Failure-path contracts (`tests/routes/batch*.contract.test.js`) | Ongoing | Add per low-coverage router as needed |
| Inline one-liner routes in `server.js` | Clear | `npm run test:server-inline-inventory` → Total: 0 |

## Audit backlog

| Item | Status | Notes |
|------|--------|--------|
| P2 heavy reads | Monitoring-first | Caps/slice baseline; indexes only from measured `query_performance` / alerts ([lib/query-performance-tracker.js](lib/query-performance-tracker.js)) |
| Multi-instance Vapi slot lease | **Deferred** | [MULTI_INSTANCE_VAPI_SLOT_LEASE.md](MULTI_INSTANCE_VAPI_SLOT_LEASE.md); product / horizontal scaling |

## Dependencies

| Item | Status | Notes |
|------|--------|--------|
| Transitive `uuid` &lt; 14 (moderate) | Open | `npm audit` reports 5; forcing `uuid@^14` via overrides **breaks Jest** (googleapis/gaxios CJS path). Resolve when upstream bumps or via Jest transform (tradeoffs in [HYGIENE_PASS_RESIDUAL.md](HYGIENE_PASS_RESIDUAL.md)) |
| `npm audit fix` (non-force) | Run periodically | Does not clear uuid chain |

## Lint

| Item | Status | Notes |
|------|--------|--------|
| `eslint . --quiet` (errors) | CI gate | Must be clean for `npm run test:ci` |
| Warnings repo-wide | Optional ratchet | Many `prefer-const`, `no-useless-escape`; fix in targeted PRs |

## How to close a row

1. Implement with tests; `npm run test:ci`.
2. Behavioral surfaces: [INTENT.md](INTENT.md) + policy/canary/invariant per [.cursor/rules/behavioral-gates.mdc](.cursor/rules/behavioral-gates.mdc).
3. Update AUDIT_MAP if paths change.
