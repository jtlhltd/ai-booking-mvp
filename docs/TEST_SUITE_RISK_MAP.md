## Test suite baseline (current)

### Coverage (from latest `npm run test:ci`)
- **Statements**: 29.91%
- **Branches**: 23.84%
- **Functions**: 31.9%
- **Lines**: 30.66%

This number is suppressed by a few **very large, side-effectful modules** (notably `db.js` and the legacy `store.js` API surface) that dominate the coverage denominator.

### Highest-risk, lowest-coverage modules (blast-radius weighted)
These are the biggest “confidence gaps” because they sit on the hot path of multiple journeys.

- **`db.js`**: ~16.6% statements / ~13.9% branches. Central to almost every route.
- **`store.js`**: 0% (currently a compatibility shim exporting `db.js` helpers).
- **`sheets.js`**: ~17.8% statements / ~28.8% branches. Critical for lead ledger side-effects.
- **`sms-email-pipeline.js`** (root): ~19.5% statements / ~12.5% branches. Messaging + followups.
- **Large route mounts with low branch coverage** (examples from table):
  - `routes/runtime-metrics-mount.js`: ~9.8% statements / ~6.4% branches
  - `routes/client-ops-mount.js`: ~21.6% statements / ~12.4% branches
  - `routes/company-enrichment-mount.js`: ~23.1% statements / ~12.9% branches

### Why the global % is low even as behavior confidence rises
- A handful of “god files” account for a huge share of executable lines/branches.
- Even with many well-targeted contracts, those files remain mostly unexecuted until we either:
  - **Refactor into testable units** (preferred long-term), or
  - **Write direct unit tests against internal helper functions** (harder when logic is not modular/DI-friendly).

## Journey matrix (source of truth)

### Journey A — Lead intake → booking
- **Lead intake (JSON-backed portal override)**: `routes/leads-portal-mount.js` (`POST /api/leads`)
- **Calendar API**: `routes/calendar-api.js` (`/api/calendar/*`)
  - `POST /find-slots` → `lib/calendar-find-slots.js`
  - `POST /book-slot` → `lib/calendar-book-slot.js`
  - `POST /check-book` → `lib/calendar-check-book.js`
  - `POST /cancel`, `POST /reschedule` live in router

### Journey B — SMS consent → compliance
- **Twilio inbound webhook (legacy store-based)**: `routes/twilio-webhooks.js` (`POST /webhooks/twilio/sms-inbound`)
- **Inbound SMS handler (DI, newer)**: `lib/twilio-sms-inbound-webhook.js` (mounted from `server.js`)
- **Status callback**: `lib/sms-status-webhook.js`

### Journey C — Admin ops
- **Admin call queue**: `routes/admin-call-queue.js`
- **Admin health/call queue mounts**:
  - `routes/admin-clients-health-mount.js` (`GET /admin/system-health`)
  - `routes/admin-server-call-queue-mount.js` (`GET /admin/call-queue`)
- **Admin Vapi logistics**: `routes/admin-vapi-logistics-mount.js`

### Journey D — Onboarding/portal
- **Signup**: `routes/client-ops-mount.js` (`POST /api/signup`)
- **Onboarding engine**: `lib/auto-onboarding.js` (creates tenant + api key, sends welcome email)

## Priority order for “comprehensive suite” work
1. **Split `db.js` into `db/*` modules** and keep `db.js` as a shim to preserve behavior.
2. **Replace “store.js as db.js alias”** with real `store/*` domain modules (twilio/leads/optouts/attempts).
3. Add route contracts that assert **invariants** (tenant isolation, opt-out, idempotency, booking correctness).
4. Add per-area coverage gates so the suite can’t regress.

