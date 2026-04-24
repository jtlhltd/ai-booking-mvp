# Maximize coverage (next execution plan)

This is a repo-local copy of the coverage plan (so it can be opened reliably in Cursor).

## Where we are now
- Coverage is already enforced via `coverageThreshold` in [`jest.config.js`](../jest.config.js) with:
  - **Global** thresholds (branches/functions/lines/statements)
  - **Per-module gates** for high-risk surfaces (booking, business hours, calendar handlers, etc.)
- `server.js` is **excluded** from coverage collection (`collectCoverageFrom` includes `!server.js`), so inline handlers won’t improve coverage unless we **extract** them.
- The entrypoint map in [`docs/ENTRYPOINT_BURNDOWN.md`](./ENTRYPOINT_BURNDOWN.md) already identifies the next inline candidates to extract.

## Goal
- Move from “route inventory + some module gates” to **near-exhaustive entrypoint coverage** by:
  - extracting inline `server.js` handlers into `lib/*` or `routes/*` modules
  - adding contract/integration tests per extracted handler
  - raising global thresholds in controlled ratchets

## Plan
### 1) Baseline coverage hotspots (don’t guess)
- Run `npm run test:coverage` and record the bottom coverage offenders under:
  - `routes/**/*.js`
  - `lib/**/*.js`
  - `middleware/**/*.js`
- Keep the existing per-module gates in `jest.config.js` as the “must not regress” set.

### 2) Systematically extract inline `server.js` handlers (largest coverage unlock)
Use [`docs/ENTRYPOINT_BURNDOWN.md`](./ENTRYPOINT_BURNDOWN.md) “Next inline candidates” as the queue.

Extraction pattern (already proven by existing extracted handlers):
- Create a focused module in `lib/` that exports:
  - `handleX(req,res,deps)` (pure-ish handler)
  - `xDeps` factory or explicit dependency bag (DB, calendar, clock, logger)
- In `server.js`, replace inline logic with a **thin mount** calling the extracted handler.
- Add tests under `tests/lib/` or `tests/routes/` (Supertest) to cover:
  - happy path
  - invalid input
  - expected side effects (DB writes, calendar calls) via mocks

Start with the highest-signal mutations:
- `POST /api/calendar/find-slots`
- `POST /api/leads/import`
- `POST /webhooks/new-lead/:clientKey`
- `POST /webhooks/facebook-lead/:clientKey`
- Select `POST /admin/*` and `POST /tools/*` mutations (triage: anything that writes, triggers outbound, or touches auth)

### 3) Expand route contract depth (beyond inventory)
- For each router in `routes/`, ensure at least:
  - 1 happy-path contract test
  - 1 failure-path test (missing/invalid input, auth failure, etc.)
- Prefer **table-driven** contract tests (batch style) to cover many endpoints quickly.

### 4) Scheduled jobs: make each job unit-testable
- Ensure each scheduled job function in `lib/scheduled-jobs.js` can be invoked with:
  - fake clock
  - fake deps
  - no real timers left running
- Add/extend tests asserting:
  - job registration wiring
  - idempotency for queue processors
  - failure handling (retry/no crash)

### 5) Ratchet thresholds (global + targeted) without breaking velocity
- After each extraction batch, raise:
  - `coverageThreshold.global.lines` and `statements` first
  - then `functions`
  - then `branches`
- For newly extracted modules, add **per-module gates** in `jest.config.js` once stable.

### 6) Keep test suite stable and fast while scaling
- Enforce deterministic patterns:
  - no real network calls (mock Twilio/Vapi/Google)
  - fake timers / injected clock for time-based code
  - strict teardown (avoid open handles)
- If a long integration test is required, isolate behind an env flag (like the Postgres smoke pattern).

## Stop condition
- All high-signal `server.js` inline mutations are extracted and covered by tests.
- Every `routes/**/*.js` file has meaningful contract coverage (not just inventory string matches).
- Global thresholds are ratcheted upward in measurable steps without flake.

