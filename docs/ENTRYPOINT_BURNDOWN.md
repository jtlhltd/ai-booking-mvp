# Entrypoint burn-down (what must be tested)

We verify **production entrypoints** (HTTP routers, critical inline handlers, webhooks) with **happy + failure** contracts where it matters—not line-by-line coverage of the whole repo.

## Baseline (current)

- **`npm test`**: full Jest suite (ESM + VM modules).
- **`npm run test:coverage`**: enforces `jest.config.js` **global** thresholds and **per-module** gates on the riskiest surfaces.
- **`npm run test:route-inventory`**: drift guard—every `routes/**/*.js` file must appear as the substring `routes/<relative-path>` in at least one file under `tests/` (string match; not a substitute for depth).

Route module count: **79** JavaScript files under `routes/` (including `routes/api/v1/index.js`).

## A) HTTP routers (`routes/**/*.js`)

**Status: satisfied for inventory** — `npm run test:route-inventory` exits `0`.

Primary batch contract suites (happy + at least one failure each):

- `tests/routes/batch1-highrisk.contract.test.js`
- `tests/routes/batch2-routes.contract.test.js`
- `tests/routes/batch3-missing-routes.contract.test.js` (fills prior gaps: `analytics`, `branding`, `clients`, `demo-setup`, `receptionist`, `static-pages`, `twilio-voice-webhooks`, `api/v1`)
- `tests/routes/admin-excluded-batch.contract.test.js`
- `tests/routes/coverage-boost.contract.test.js`

Focused suites also cover high-churn routers (e.g. `appointments.contract.test.js`, `vapi-webhooks.idempotency.test.js`, `twilio-webhooks.contract.test.js`).

## B) Inline `server.js` routes (high risk)

These are **not** under `routes/`; they only appear in coverage if extracted or if `server.js` is added to `collectCoverageFrom`.

| Method & path | Implementation | Tests |
|---------------|----------------|-------|
| `POST /api/calendar/check-book` | `lib/calendar-check-book.js` (`handleCalendarCheckBook`); thin mount + `calendarCheckBookDeps` in `server.js` | `tests/lib/calendar-check-book.test.js` |
| `POST /api/calendar/book-slot` | `lib/calendar-book-slot.js` (`handleCalendarBookSlot`); thin mount + `calendarBookSlotDeps` in `server.js` | `tests/lib/calendar-book-slot.test.js` |
| `GET /healthz` | `lib/healthz.js` (`handleHealthz`); thin mount + `healthzDeps` in `server.js` | `tests/lib/healthz.test.js` |
| `GET /gcal/ping` | `lib/gcal-ping.js` (`handleGcalPing`); thin mount + `gcalPingDeps` in `server.js` | `tests/lib/gcal-ping.test.js` |

Inline route inventory:

- Run: `npm run test:server-inline-inventory`
- Purpose: a drift guard + prioritization list (mutation/auth surfaces first).

Next inline candidates to extract (high-signal mutations, not already routed through `routes/**`):

- `POST /api/calendar/book-slot` (booking mutation)
- `POST /api/calendar/find-slots` (availability core)
- `POST /api/leads/import` (data ingestion)
- `POST /webhooks/new-lead/:clientKey` and `POST /webhooks/facebook-lead/:clientKey` (external ingest)
- `POST /admin/*` and `POST /tools/*` (ops surfaces; extract selectively when changed)

Other inline `app.get` / `app.post` handlers in `server.js` should be triaged the same way when changed: extract or add targeted tests.

## C) Webhooks (must-not-regress)

- **Vapi** (`routes/vapi-webhooks.js`): durable ingest + idempotency (`tests/routes/vapi-webhooks.idempotency.test.js`); tool-call parse failures must not break ingest (`tests/routes/vapi-webhooks.tool-call-boundaries.contract.test.js`).
- **Twilio SMS** (`routes/twilio-webhooks.js`): STOP path + unknown-tenant no-op (`tests/routes/twilio-webhooks.contract.test.js`).
- **Twilio Voice** (`routes/twilio-voice-webhooks.js`): happy TwiML + routing failure fallback (`tests/routes/batch3-missing-routes.contract.test.js`).

## D) Optional Postgres smoke

- **`tests/integration/postgres-url-smoke.test.js`** runs only when **both** `TEST_DATABASE_URL` is set **and** `RUN_POSTGRES_SMOKE_TESTS=1` (avoids flaky CI/local URLs in the default `npm test` run).

## E) Coverage ratchet

Global thresholds live in `jest.config.js` (`coverageThreshold.global`). Module gates exist for e.g. `lib/booking.js`, `lib/business-hours.js`, `lib/calendar-check-book.js`, and selected `routes/*.js`. Raise globals only when the denominator includes newly tested surfaces.
