# Entrypoint burn-down (what must be tested)

We verify **production entrypoints** (HTTP routers, critical inline handlers, webhooks) with **happy + failure** contracts where it matters—not line-by-line coverage of the whole repo.

## Baseline (current)

- **`npm test`**: full Jest suite (ESM + VM modules).
- **`npm run test:coverage`**: enforces `jest.config.js` **global** thresholds and **per-module** gates on the riskiest surfaces.
- **`npm run test:route-inventory`**: drift guard—every `routes/**/*.js` file must appear as the substring `routes/<relative-path>` in at least one file under `tests/` (string match; not a substitute for depth).

Route module count: run **`npm run test:route-inventory`** for the current number of `routes/**/*.js` files (drift guard prints `Route modules: N`).

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

**Source of truth for what is still a one-line `app.get` / `app.post` in `server.js`:** run **`npm run test:server-inline-inventory`** (see [`scripts/server-inline-route-inventory.mjs`](../scripts/server-inline-route-inventory.mjs)). Most HTTP surfaces now live under `routes/**` (calendar, imports, public reads, notify/Twilio SMS, etc.).

| Method & path | Implementation | Tests |
|---------------|----------------|-------|
| `POST /api/calendar/check-book` | `lib/calendar-check-book.js` via [`routes/calendar-api.js`](../routes/calendar-api.js) (mounted from `server.js`) | `tests/lib/calendar-check-book.test.js` |
| `POST /api/calendar/book-slot` | `lib/calendar-book-slot.js` via `routes/calendar-api.js` | `tests/lib/calendar-book-slot.test.js` |
| `GET /healthz` | `lib/healthz.js` via [`routes/health-probes-mount.js`](../routes/health-probes-mount.js) | `tests/lib/healthz.test.js`, `tests/routes/health-probes-mount.contract.test.js` |
| `GET /gcal/ping` | `lib/gcal-ping.js` via `routes/health-probes-mount.js` | `tests/lib/gcal-ping.test.js`, `tests/routes/health-probes-mount.contract.test.js` |
| `POST /api/leads/import` (+ `import__legacy`) | `routes/import-leads.js` + `lib/leads-import.js`; post-insert dial/queue in `lib/lead-import-outbound.js` | `tests/routes/import-leads.contract.test.js`, `tests/lib/leads-import.test.js` |
| `POST /webhooks/new-lead/:clientKey`, `POST /webhooks/facebook-lead/:clientKey` | `routes/meta-ingest-webhooks-mount.js` + `lib/webhooks-new-lead.js` / `lib/webhooks-facebook-lead.js` | `tests/routes/meta-ingest-webhooks.contract.test.js`, `tests/lib/webhooks-new-lead.test.js`, `tests/lib/webhooks-facebook-lead.test.js` |

Inline route inventory:

- Run: `npm run test:server-inline-inventory`
- Purpose: a drift guard + prioritization list. When **Total: 0**, there are no matching one-line verb registrations left; remaining `server.js` size is mostly **helpers**, **bootstrap**, and **`app.use(...)`** wiring.

**Next burndown queue (after inline routes):**

- Extract large **pure helper** clusters from `server.js` (dashboard activity SQL, `getIntegrationStatuses`, seed/bootstrap) into `lib/*` in small PRs.
- Add **failure-path** contracts for low-coverage `routes/*.js` (see `tests/routes/batch*.contract.test.js`).
- Continue **`db.js` → `db/*.js`** seams with `tests/db/*` contracts.

## C) Webhooks (must-not-regress)

- **Vapi** (`routes/vapi-webhooks.js`): durable ingest + idempotency (`tests/routes/vapi-webhooks.idempotency.test.js`); tool-call parse failures must not break ingest (`tests/routes/vapi-webhooks.tool-call-boundaries.contract.test.js`).
- **Twilio SMS** (`routes/twilio-webhooks.js`): STOP path + unknown-tenant no-op (`tests/routes/twilio-webhooks.contract.test.js`).
- **Twilio Voice** (`routes/twilio-voice-webhooks.js`): happy TwiML + routing failure fallback (`tests/routes/batch3-missing-routes.contract.test.js`).

## D) Optional Postgres smoke

- **`tests/integration/postgres-url-smoke.test.js`** runs only when **both** `TEST_DATABASE_URL` is set **and** `RUN_POSTGRES_SMOKE_TESTS=1` (avoids flaky CI/local URLs in the default `npm test` run).

## E) Coverage ratchet

Global thresholds live in `jest.config.js` (`coverageThreshold.global`). Module gates exist for e.g. `lib/booking.js`, `lib/business-hours.js`, `lib/calendar-check-book.js`, and selected `routes/*.js`. Raise globals only when the denominator includes newly tested surfaces.
