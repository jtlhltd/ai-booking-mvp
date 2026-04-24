# Testing

This repo uses **Jest (ESM)** for unit/contract/integration tests.

## Quick commands

- `npm test`: default test run
- `npm run test:coverage`: coverage run
- `npm run test:ci`: full suite (enables DB + SQLite integration subsets)
- `npm run test:route-inventory`: verify every `routes/*.js` has at least one Jest test
- `npm run test:server-inline-inventory`: ensure `server.js` stays “wiring-only” (no inline routes)

## Windows prerequisites (for the full suite)

Some integration tests rely on `better-sqlite3` (native addon). On Windows you typically need:

- **Node 20** (recommended): see `.nvmrc` / `.node-version`
- **Visual Studio Build Tools 2022** (Desktop development with C++)
- A working Python (only if node-gyp needs it for your setup)

If you change Node versions, it can help to rebuild the native addon:

```bash
npm ci
npm rebuild better-sqlite3
```

## Postgres for local full runs (Windows)

The full suite expects a Postgres database when `RUN_DB_INTEGRATION_TESTS=1` / `RUN_POSTGRES_SMOKE_TESTS=1`.
Easiest path is Docker:

```bash
docker run --rm -d --name testdb -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=testdb -p 5432:5432 postgres:15-alpine
```

Then set:

```bash
set TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/testdb
```

and run:

```bash
npm run test:ci
```

## Writing new tests (project conventions)

### Test tiers
- **Unit tests**: isolate branchy logic. Prefer mocking dependencies and using deterministic time/random.
- **Contract tests**: mount routers via a minimal Express app and assert response shapes + side-effects.
- **Integration tests**: exercise real DB-backed flows (keep these few and stable).

### Preferred contract harness
Use `tests/helpers/contract-harness.js`:
- `createContractApp({ mounts })`: mount one or more routers without importing `server.js`.
- `withEnv(env, fn)`: temporarily set environment variables within a test.

### Determinism helpers
Use:
- `tests/helpers/determinism.js` (`withFakeNow`, `withMockedMathRandom`)
- `tests/helpers/fixtures.js` (`tenantFixture`, `leadFixture`)

### Definition of done (for new production code)
- Any new `routes/*.js` change adds/updates at least one **contract** test.
- Any new branchy `lib/*.js` change adds/updates a **unit** test.
- `npm run test:ci` must be green.

