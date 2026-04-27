# Smoke tests

This directory holds **manual / opt-in smoke checks** that need a live service
(server up, real DB, real third-party endpoints reachable).

These are **not** part of the Jest gate. CI (`npm run test:ci`) does not run them.

## Why they live here

The Jest suite (`tests/`) is the single source of automated truth. Anything that
needs an actual server boot, network out, or persistent infra is reclassified as
smoke and lives here so it can be invoked deliberately.

## Existing smoke surfaces

PowerShell-based smoke harnesses already exist at `tests/*.ps1` (e.g.
`tests/smoke.ps1`, `tests/quick-test.ps1`, `tests/test-vapi-integration.ps1`).
They predate this folder and continue to work; new smoke checks added as Node
scripts should land here.

## Conventions

- Gate via `SMOKE=1` (or a more specific env like `SMOKE_VAPI=1`) so the script
  exits 0 fast when not requested.
- Never import these from `tests/` — Jest must not pick them up. The repo
  `jest.config.js` already excludes `/scripts/smoke/`.
- Keep them idempotent and read-only against shared envs whenever possible.

## Running

```bash
SMOKE=1 node scripts/smoke/<name>.mjs
```
