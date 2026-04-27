# tests/

Jest is the **single** automated test gate for this repo. There is no longer a
parallel script-style runner — anything that needs a live server / real infra
lives under `scripts/smoke/` and is opt-in.

For the full layout, conventions, contract checklist, and how to run each tier,
see **[`docs/TESTING.md`](../docs/TESTING.md)**.

## Quick map

```
tests/
  helpers/                # shared helpers — import from here
    contract-harness.js   # createContractApp, withEnv
    contract-asserts.js   # assertNoStoreCache, assertNoTenantKeyLeak,
                          # assertAuthRequired, assertTenantIsolation,
                          # assertJsonErrorEnvelope
    determinism.js        # withFakeNow, withMockedMathRandom
    fixtures.js           # tenantFixture, leadFixture
  unit/                   # pure logic (mock IO, deterministic clock)
  routes/                 # contract tests (one file per router)
  db/                     # DB-backed unit tests
  integration/            # opt-in real-DB integration (Tier 3)
  harness/                # shared scaffolding (excluded from test runs)
  setup.js                # global setup: console filter + singleton teardown
```

## Most-used commands

```bash
npm test                       # full Jest run
npm run test:coverage          # coverage + threshold check
npm run test:integration-lite  # tests/routes + tests/db (fastest meaningful tier)
npm run test:detect-leaks      # --detectOpenHandles --runInBand
npm run test:ci                # full CI tier (gates + leak detection)
```

## Contract test checklist

Use `tests/helpers/contract-asserts.js`. Each router contract file should cover
at least:

- happy path
- 4xx (validation or missing entity)
- 5xx (thrown dep) → `assertJsonErrorEnvelope`
- auth-required routes → `assertAuthRequired`
- tenant-scoped routes → `assertTenantIsolation`
- dashboard/admin reads → `assertNoStoreCache`
- customer-facing payloads → `assertNoTenantKeyLeak(res, 'd2d-xpress-tom')`

See `docs/TESTING.md` for the full checklist and rationale.
