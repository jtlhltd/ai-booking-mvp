# Testing

This repo uses **Jest (ESM)** as the **single** automated test gate. Anything that
needs a live server, real third-party endpoints, or persistent infra is reclassified
as smoke and lives in `scripts/smoke/` (see [Smoke layer](#smoke-layer-opt-in)).

## Quick commands

| Command | What it does |
| --- | --- |
| `npm test` | Run the full Jest suite (no coverage). |
| `npm run test:coverage` | Run with coverage; enforces `coverageThreshold` from `jest.config.js`. |
| `npm run test:coverage-hotspots` | Coverage run + `scripts/coverage-hotspots.mjs` to surface low-coverage files. |
| `npm run test:ci` | Tiered CI run (route-inventory + server-inline gates + Jest + leak detection). |
| `npm run test:unit` | Only `tests/unit/**`. |
| `npm run test:integration` | Only `tests/integration/**`. |
| `npm run test:integration-db` | The Postgres/SQLite integration test (needs `TEST_DATABASE_URL`). |
| `npm run test:integration-lite` | `tests/routes` + `tests/db` only — fastest meaningful tier. |
| `npm run test:detect-leaks` | `--detectOpenHandles --runInBand` for diagnosing timer/handle leaks. |
| `npm run test:route-inventory` | Verify every `routes/*.js` has at least one Jest test. |
| `npm run test:server-inline-inventory` | Ensure `server.js` stays "wiring-only" (no inline routes). |

## Test layout (`tests/`)

```
tests/
  helpers/                    # shared test helpers (importable from tests/)
    contract-harness.js       # createContractApp({ mounts }), withEnv(...)
    contract-asserts.js       # assertNoStoreCache, assertNoTenantKeyLeak,
                              # assertAuthRequired, assertTenantIsolation,
                              # assertJsonErrorEnvelope
    determinism.js            # withFakeNow, withMockedMathRandom
    fixtures.js               # tenantFixture, leadFixture
    contract-asserts.test.js  # tests for the asserts themselves
  unit/                       # pure logic tests (mock IO, deterministic clock)
    lib/<module>.test.js
    security/<area>.test.js
  routes/                     # contract tests per router (one file per router)
    <router>.contract.test.js
  db/                         # DB-related tests (uses test pool / SQLite)
  integration/                # opt-in real-DB integration (Tier 3)
  harness/                    # shared scaffolding (excluded from test runs)
  setup.js                    # global Jest setup (console filter + teardown)
  setup.js                    # see "Console output" + "Teardown" below
```

There is **no** longer a parallel script-style framework under
`tests/**/test-*.js`. Those files were either migrated into Jest tests or moved
to `scripts/smoke/`. Do not reintroduce a second runner.

## Smoke layer (opt-in)

`scripts/smoke/` holds manual / opt-in smoke checks that need a live service.
See `scripts/smoke/README.md`. Jest explicitly ignores `/scripts/smoke/` via
`testPathIgnorePatterns`.

Run a smoke script deliberately:

```bash
SMOKE=1 node scripts/smoke/<name>.mjs
```

CI (`npm run test:ci`) does **not** run smoke scripts.

## Writing new tests

### Test tiers

- **Unit tests** (`tests/unit/**`): isolate branchy logic. Prefer mocking deps,
  use `withFakeNow` / `withMockedMathRandom` for determinism.
- **Contract tests** (`tests/routes/**`): mount routers via the contract harness
  and assert response shapes **and** semantics (auth, tenancy, error envelope —
  see [Contract checklist](#contract-checklist) below).
- **Integration tests** (`tests/integration/**`): exercise real DB-backed flows.
  Keep these few, stable, and gated by the appropriate env (see
  [Postgres for local full runs](#postgres-for-local-full-runs-windows)).

### Preferred contract harness

Use `tests/helpers/contract-harness.js`:

- `createContractApp({ mounts })`: mount one or more routers without importing
  `server.js`.
- `withEnv(env, fn)`: temporarily set environment variables within a test.

### Determinism helpers

Use `tests/helpers/determinism.js` (`withFakeNow`, `withMockedMathRandom`)
and `tests/helpers/fixtures.js` (`tenantFixture`, `leadFixture`).

## Contract checklist

Every router contract test should cover **at least** the following, where
applicable. Use the helpers in `tests/helpers/contract-asserts.js` rather than
hand-rolling the assertions:

| Concern | Helper | What to assert |
| --- | --- | --- |
| Auth | `assertAuthRequired(app, { method, path })` | Missing/invalid `X-API-Key` returns 401 on admin/client routes. |
| Tenant isolation | `assertTenantIsolation(app, { method, path })` | Cross-tenant `clientKey` returns 403 (not silent 200). |
| Tom-context safety | `assertNoTenantKeyLeak(res, 'd2d-xpress-tom')` | Tenant key (e.g. `d2d-xpress-tom`) does not appear in customer-facing bodies/headers. |
| Cache headers | `assertNoStoreCache(res)` | Dashboard/admin reads include `Cache-Control: no-store`. |
| Error envelope | `assertJsonErrorEnvelope(res, { status })` | Errors return `{ ok: false, error }`, no stack leaks, sensible status. |

Each contract file should also assert at minimum: a happy path, a 4xx (validation
or missing-entity), and a 5xx (thrown dep) for every major handler.

## Console output

`tests/setup.js` filters `console.log` **deny-by-default** so CI output stays
clean. Re-enable verbose logs locally with:

```bash
JEST_VERBOSE_LOGS=1 npm test
```

`console.error` and `console.warn` are not filtered globally. Suite-level noise
should be silenced inside `beforeAll` of the relevant test file.

## Resource teardown

`tests/setup.js` calls `stop()` / `dispose()` on the long-lived singletons in
`afterAll`:

- `lib/cache.js` (interval cleanup)
- `lib/monitoring.js` (`MetricsCollector`, `AlertManager`, `HealthCheckManager`)
- `lib/retry-logic.js` (`HealthCheckManager`)
- `db.js` (`pool.end()`)

When you add a new module that schedules timers at import, either:

1. `.unref()` the timer so it does not keep the worker alive, **or**
2. Export a `stop()` / `dispose()` and wire it into `tests/setup.js`'s
   `afterAll`.

`npm run test:ci` will fail the build if Jest emits the
`A worker process has failed to exit gracefully` warning, so this is enforced.

## Coverage thresholds

`jest.config.js` enforces:

- A **global** floor for branches/functions/lines/statements.
- **Per-module gates** for high-risk surfaces (booking, admin, the routes
  improved during the test-suite overhaul, etc.).

When you add a per-module gate for a near-100% file, the *global* numbers in
the threshold check go **down** (Jest computes global as the merge of files
that do *not* match a path key). Always re-run `npm run test:coverage` after
editing thresholds and use the threshold-error percentages — not the printed
summary table — to set safe floors.

## Windows prerequisites (for the full suite)

Some integration tests rely on `better-sqlite3` (native addon). On Windows you
typically need:

- **Node 20** (recommended): see `.nvmrc` / `.node-version`
- **Visual Studio Build Tools 2022** (Desktop development with C++)
- A working Python (only if node-gyp needs it for your setup)

If you change Node versions, it can help to rebuild the native addon:

```bash
npm ci
npm rebuild better-sqlite3
```

## Postgres for local full runs (Windows)

The full suite expects a Postgres database when `RUN_DB_INTEGRATION_TESTS=1` /
`RUN_POSTGRES_SMOKE_TESTS=1`. Easiest path is Docker:

```bash
docker run --rm -d --name testdb -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=testdb -p 5432:5432 postgres:15-alpine
```

Then:

```bash
set TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/testdb
npm run test:ci
```

## Definition of done (for new production code)

- Any new `routes/*.js` change adds/updates at least one **contract** test that
  exercises the [contract checklist](#contract-checklist) where applicable.
- Any new branchy `lib/*.js` change adds/updates a **unit** test.
- `npm run test:ci` is green (suite passes, route-inventory + server-inline
  gates pass, leak detection lane passes, coverage thresholds met).
