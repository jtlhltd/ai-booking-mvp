# Codebase hygiene burndown

Record of the multi-PR cleanup that ran from PR-0 to PR-12. The goal was
not "make `server.js` and `db.js` small overnight" — it was to:

1. Remove dead code, stale docs, and tracked runtime artifacts.
2. Land tests, gates, and runtime invariants for the audit-backlog
   findings that had been deferred for months.
3. Pull cohesive pure helpers and SQL clusters out of the two god-files
   into testable siblings, without changing public API.

This file is a stable index so future contributors can see what was
done, what is still outstanding, and which gates protect the new state.

## What landed

| PR    | Theme                                        | Highlights                                                                                                                                                                                                                                              |
| ----- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR-0  | Working-tree junk                            | Deleted untracked debug screenshots / one-off JSON / temp images at repo root.                                                                                                                                                                          |
| PR-1  | Root tidy + dead-code prune                  | Deleted 6 dead root-level scripts (no callers); moved `audit-summary.md`, `audit-backlog.md`, `setup.sh`, `d2dlog.png` into `docs/` / `scripts/` / `clients/d2d-xpress-tom/`; relocated `enhanced-business-search.js` and friends into `lib/`.           |
| PR-2  | `tests/` folder tidy                         | Moved ~45 PowerShell + `.bat` smoke scripts from `tests/` to `tests/manual/` (kept `tests/smoke.ps1` at the root by design); refreshed `tests/README.md`, `scripts/smoke/README.md`, `docs/RELEASE_CHECKLIST.md`.                                        |
| PR-3  | `.gitignore` + tracked artifacts             | Removed runtime-generated `data/*.json`, `demos/.client-*.json`, `demos/*-2025-*.html` from the index (left on disk); extended `.gitignore` so they cannot be re-committed.                                                                             |
| PR-4  | Sparse module consolidation                  | Deleted dead `services/client-service.js`; moved `util/phone.js` → `lib/phone-util.js`; moved sample `clients/acme/dashboard.html` to `tests/fixtures/`; documented `store.js`'s role vs `db.js` and `store/`.                                          |
| PR-5  | Lint/format + dependency audit               | Introduced `eslint.config.js` (flat config, ratcheting), `.prettierrc.json` / `.prettierignore`, `lint` / `format` scripts, lint gate in `npm run test:ci`; removed `node-fetch` everywhere (Node 20+ native fetch).                                    |
| PR-6  | PII log scrubber + monitor cleanup           | Added `lib/log-scrubber.js` (production-only PII redaction) and applied it to webhook/import logs; deleted unused-and-broken `lib/query-monitor.js`; fixed `lib/query-optimizer.js` `setTimeout` leak via `finally` + `.unref()`.                        |
| PR-7  | P0 — queue completion + retry counter        | Locked down the `request_queue` retry behaviour; added `tests/canaries/request-queue-retries-bounded.canary.test.js` and the matching `queue.request-queue-retries-bounded` row in `docs/INTENT.md`.                                                    |
| PR-8  | P0 — clients-api auth + tools-mount lockdown | Added regression tests for `requireTenantAccess` recognising `:clientKey` / `:key` / `:tenantKey` route params; verified `routes/clients-api.js` and `routes/tools-mount.js` are gated by `authenticateApiKey` / `verifyVapiSignature`.                 |
| PR-9  | P1 — dial-spend safety                       | Renamed `lib/instant-calling.js#processCallQueue` → `dialLeadsNowBatch`; gated `processLeadImportOutboundCalls` behind `ALLOW_LEGACY_INSTANT_IMPORT_DIAL=1`; added `dial.no-instant-calling-process-call-queue-import` policy gate; added underflow / unknown-release counters surfaced via `lib/ops-invariants.js`. |
| PR-10 | server.js helper extraction                  | Extracted ~430 lines of pure dashboard / lead-timeline formatters from `server.js` into `lib/dashboard-activity-formatters.js`; extracted `bootstrapClients` into `lib/bootstrap-clients.js`; added 32 unit tests.                                       |
| PR-11 | db.js sibling extraction                     | Extracted cost / budget / cost-alert and analytics-events / conversion-funnel query clusters into `db/cost-budget-tracking.js` and `db/analytics-events.js`; db.js shrunk by 216 lines; added 24 contract tests with whitelisted `period`/`days` to interval mapping. |
| PR-12 | Docs sweep                                   | This file. Refreshed `README.md` project structure, refreshed `docs/AUDIT_MAP.md` to reflect the new file layout, deleted superseded planning docs.                                                                                                     |

**Post-PR-12 (hygiene backlog closure):** Route payload logging is pinned by policy (`privacy.no-pretty-json-req-body`, `privacy.no-bare-req-body-console-arg`) plus `lib/log-scrubber.js`. Remaining OPEN items in [`AUDIT_BACKLOG.md`](AUDIT_BACKLOG.md) are **heavy reads** (evidence-driven caps/indexes) and **DEFERRED** multi-instance Vapi slot lease only.

## Gates added or sharpened

These are the regression catchers wired into `npm run test:ci`:

- `scripts/check-policy.mjs`
  - `dial.imports-distribute-not-burst` (existing — text widened)
  - `dial.no-instant-calling-process-call-queue-import` (new in PR-9)
- `tests/canaries/`
  - `request-queue-retries-bounded.canary.test.js` (PR-7)
  - `legacy-instant-import-dial-gated.canary.test.js` (PR-9)
  - `sqlite-call-queue-phantom-check.canary.test.js` (post-PR-12 SQLite **call_queue** parity)
- `lib/ops-invariants.js`
  - `vapi_concurrency_underflow` (PR-9)
  - `vapi_concurrency_unknown_release` (PR-9)
- Unit tests
  - `tests/unit/lib/dashboard-activity-formatters.test.js` (PR-10)
  - `tests/unit/lib/bootstrap-clients.test.js` (PR-10)
  - `tests/db/cost-budget-tracking.contract.test.js` (PR-11)
  - `tests/db/analytics-events.contract.test.js` (PR-11)
  - `tests/unit/lib/log-scrubber.test.js` (PR-6)

## Coverage thresholds

Coverage thresholds in `jest.config.js` were lowered ~2 pp in PR-9 to
absorb the new defensive code (gate throw paths, diagnostic counters,
ops-invariant reads) and held there through PR-10 / PR-11. Measured
floors at the end of PR-11 sit comfortably above the configured
thresholds; future PRs that add coverage should ratchet upward.

## What is intentionally still outstanding

Tracked in [`docs/AUDIT_BACKLOG.md`](AUDIT_BACKLOG.md). The hygiene
burndown deliberately stopped at the items above; the remaining backlog
items either need a product decision (e.g. rate-limit posture) or
non-trivial schema / runtime work (e.g. DB-backed Vapi slot lease for
multi-instance deployments). Each one has an Intent ID in
[`docs/INTENT.md`](INTENT.md), so the gates will keep behaviour pinned
even before the underlying work lands.

**Living exhaustive queue (signals + status):** [`docs/HYGIENE_EXHAUSTIVE_QUEUE.md`](HYGIENE_EXHAUSTIVE_QUEUE.md). **Explicit deferrals / known leftovers:** [`docs/HYGIENE_PASS_RESIDUAL.md`](HYGIENE_PASS_RESIDUAL.md).

## Pattern: how to extract another helper cluster

If a future contributor wants to keep peeling away at `server.js` /
`db.js`, the proven pattern is:

1. Pick a cluster of pure helpers that do not read module-level state.
2. Move them to a focused module under `lib/` (for app code) or `db/`
   (for SQL).
3. For db siblings, accept `query` as the first parameter; have `db.js`
   re-export thin wrappers that bake in its runner-bound `query` for
   back-compat.
4. Add direct unit tests against the new module.
5. Run `npm run test:ci` and confirm zero behavioural change.
6. Update `docs/AUDIT_MAP.md` with the new path.

PR-10 and PR-11 in this burndown are concrete examples of (1)–(6).
