# Hygiene pass — explicit residual and deferrals

This file answers “what’s **known** left?” after an exhaustive hygiene pass—not “nothing could ever improve.”

## Deferred by product / architecture

| Item | Reason |
|------|--------|
| **Multi-instance Vapi slot lease** | Needs horizontal-scaling requirement + migration; see [MULTI_INSTANCE_VAPI_SLOT_LEASE.md](MULTI_INSTANCE_VAPI_SLOT_LEASE.md) and [AUDIT_BACKLOG.md](AUDIT_BACKLOG.md) DEFERRED. |

## Deferred by upstream / tooling

| Item | Reason |
|------|--------|
| **Transitive `uuid` &lt; 14** (`npm audit` moderate, ×5) | Forcing `uuid@^14` via `package.json` overrides breaks Jest loading `googleapis` → `gaxios` (ESM/CJS). Clear when `googleapis` / `gaxios` / `node-cron` pull a patched `uuid`, or add a targeted Jest `transformIgnorePatterns` / transform pipeline (tradeoffs). |

## Monitoring-first (not guesswork)

| Item | Reason |
|------|--------|
| **P2 heavy reads — extra indexes** | Only add composite indexes or stricter pagination when [lib/query-performance-tracker.js](lib/query-performance-tracker.js) / alerts show repeat offenders; see [AUDIT_BACKLOG.md](AUDIT_BACKLOG.md) OPEN P2. |

## Large files (ongoing burndown, not blocking)

| Item | Notes |
|------|--------|
| **`server.js` ~6k lines** | Wiring + many helpers; continue extracting pure clusters to `lib/*` per [HYGIENE.md](HYGIENE.md). |
| **`db.js` ~4k lines** | Continue `db/*.js` siblings with contract tests. |

## Lint warnings (non-blocking in CI)

`npm run lint` without `--quiet` reports many **warnings** (`prefer-const`, `no-useless-escape`, etc.). CI uses `eslint . --quiet` (errors only). Warning cleanup can proceed file-by-file.

## Verification commands

After changes: `npm run test:ci`, `npm run test:route-inventory`, `npm run test:server-inline-inventory`.
