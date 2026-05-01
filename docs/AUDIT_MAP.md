# Codebase audit map (entrypoints + dependencies)

This file is a **map of what to test** (and what “the system” is) so verification can be systematic and exhaustive.

## Primary entrypoints

### Server
- **HTTP server**: `server.js` (still the main wiring file; ongoing burndown documented in `docs/ENTRYPOINT_BURNDOWN.md` and `docs/HYGIENE.md`)
- **DB layer**: `db.js` (Postgres + SQLite fallback). Cohesive query clusters now live in sibling modules and `db.js` re-exports thin wrappers:
  - `db/cost-budget-tracking.js` — cost tracking, budget limits, cost alerts
  - `db/analytics-events.js` — analytics events, conversion stages, conversion funnel
- **Scheduled work**: `lib/scheduled-jobs.js` (cron + intervals)
- **Pure helpers extracted from `server.js`**:
  - `lib/dashboard-activity-formatters.js` — dashboard / lead-timeline formatting + classification (no module state)
  - `lib/bootstrap-clients.js` — `BOOTSTRAP_CLIENTS_JSON` env-driven client seeding
- **In-memory dial path**: `lib/instant-calling.js` — burst dialer is named `dialLeadsNowBatch` (renamed from `processCallQueue` in PR-9). The DB-polling worker `processCallQueue` lives in `server.js` and is the only one cron should ever call.

### HTTP routes mounted in `server.js`
The app uses a mix of routers (from `routes/*.js`) plus a number of legacy inline `app.get/app.post` handlers.

**Booking:** `POST /api/calendar/check-book` is implemented in `lib/calendar-check-book.js` (tested in `tests/lib/calendar-check-book.test.js`) and mounted from `server.js` with an explicit dependency bag—so booking logic is covered without pulling the entire `server.js` into Jest coverage.

#### Routers imported from `routes/`
Imported in `server.js`:
- `routes/leads.js`
- `routes/twilio-webhooks.js`
- `routes/vapi-webhooks.js`
- `routes/twilio-voice-webhooks.js`
- `routes/appointments.js`
- `routes/receptionist.js`
- `routes/health.js`
- `routes/monitoring.js`
- `routes/backend-status.js`
- `routes/demo-setup.js`
- `routes/ops.js`
- `routes/static-pages.js`
- `routes/outreach.js`
- `routes/crm.js`
- `routes/branding.js`
- `routes/analytics.js`
- `routes/clients-api.js`
- `routes/calendar-api.js`
- `routes/leads-followups.js`
- `routes/sms-email-pipeline.js`
- `routes/booking-test.js`
- `routes/vapi-dev.js`
- `routes/admin-test-lead-data.js`
- `routes/admin-test-script.js`
- `routes/admin-validate-call-duration.js`
- `routes/pipeline-tracking.js`
- `routes/pipeline-retry.js`
- `routes/zapier-webhook.js`
- `routes/import-leads-csv.js`
- `routes/google-places-test.js`
- `routes/book-demo.js`
- `routes/available-slots.js`
- `routes/create-client.js`
- `routes/quality-alerts.js`
- `routes/import-leads.js`
- `routes/import-lead-email.js`
- `routes/roi.js`
- `routes/industry-comparison.js`
- `routes/call-time-bandit.js`
- `routes/retry-queue.js`
- `routes/follow-up-queue.js`
- `routes/next-actions.js`
- `routes/call-recordings.js`
- `routes/voicemails.js`
- `routes/call-recordings-stream.js`
- `routes/recordings-quality-check.js`
- `routes/reports.js`
- `routes/sms-templates.js`
- `routes/monitoring-dashboard.js`
- `routes/api-docs.js`
- `routes/quick-win-metrics.js`
- `routes/health-and-diagnostics.js`
- `routes/ops-health-and-dnc.js`
- `routes/daily-summary.js`
- `routes/core-api.js`
- `routes/admin-overview.js`
- `routes/admin-reminders.js`
- `routes/admin-clients.js`
- `routes/admin-analytics-advanced.js`
- `routes/admin-operations.js`
- `routes/admin-sales-pipeline.js`
- `routes/admin-email-tasks-deals.js`
- `routes/admin-calendar.js`
- `routes/admin-documents-comments-fields.js`
- `routes/admin-templates.js`
- `routes/admin-call-recordings.js`
- `routes/admin-call-queue.js`
- `routes/admin-outbound-weekday-journey.js`
- `routes/admin-calls-insights.js`
- `routes/admin-lead-scoring.js`
- `routes/admin-appointments.js`
- `routes/admin-follow-ups.js`
- `routes/admin-reports.js`
- `routes/admin-social.js`
- `routes/admin-multi-client.js`
- `routes/admin-call-queue-ops.js`
- `routes/admin-roi-calculator.js`

#### Inline routes inside `server.js`
There are also many direct `app.get/app.post/...` handlers inside `server.js` (legacy / demo / tools / debug). These must be included in the entrypoint coverage inventory.

## Scheduled jobs (from `lib/scheduled-jobs.js`)
All schedules are registered via `registerScheduledJobs(deps)`. Current schedules include:
- **Every 5 minutes (setInterval)**: appointment reminder processor (`sendScheduledReminders`)
- **Hourly**: quality monitoring
- **Every 5 minutes**: appointment reminder queue, follow-up queue, database health, stuck processing reaper, ops invariants, new-lead queuer
- **Every 2 minutes**: call queue processor (even minutes), retry queue + request-queue (odd minutes)
- **Every 15 minutes**: outbound A/B sample-ready sweep, pool health monitor
- **Daily**: backup monitoring (6 AM), DLQ cleanup (2 AM)
- **Weekly**: weekly reports + operator weekly stack report (Mondays 9 AM), weekly automated client reports (Mondays 9 AM)
- **Every 6 hours**: budget monitoring
- **Weekly (Sunday 3 AM)**: automated data cleanup / GDPR retention job
- **Every 5 minutes (offset)**: webhook retry processor

## External integrations (adapters to test via mocks + sandbox)
- **Twilio**: `routes/twilio-webhooks.js`, `routes/twilio-voice-webhooks.js`, `lib/messaging-service.js`
- **Vapi**: `routes/vapi-webhooks.js`, `middleware/vapi-webhook-verification.js`, `lib/vapi.js`
- **Google Calendar / Google APIs**: `routes/calendar-api.js`, `sheets.js`, `lib/sheets-functions.js` (and related helpers)

## High-risk / must-be-correct domains (priorities)
- **Booking + data correctness**
  - likely modules: `routes/appointments.js`, `lib/booking.js`, `lib/slots.js`, `lib/business-hours.js`, DB write/query helpers in `db.js`
- **Dashboard/admin correctness**
  - likely modules: `routes/monitoring-dashboard.js`, `routes/admin-*.js`, `lib/monitoring-dashboard.js`, `lib/admin-hub-data.js`

## Testing approach mapping
- **Tier 1 (CI gate)**: Jest unit + integration (mock externals; deterministic; no real Twilio/Vapi/Google).
- **Tier 2 (nightly/pre-release)**: E2E smoke tests (start server, hit key endpoints, verify DB effects).
- **Tier 3 (nightly/on-demand)**: sandbox integration checks for Twilio/Vapi/Google with strict rate limits and “kill switches”.

## Behavioural gates protecting this map
- **Static policy**: `scripts/check-policy.mjs` (run via `npm run check:policy`) — forbidden import patterns, no direct `fetch('https://api.vapi.ai/call', ...)` outside the allow-list, no imports of the renamed `processCallQueue` from `lib/instant-calling.js`.
- **Canaries**: `tests/canaries/*.canary.test.js` — bounded request-queue retries, gated legacy instant-import dial path, etc.
- **Runtime invariants**: `lib/ops-invariants.js` — Vapi concurrency underflow / unknown-release detection, queue health, etc.
- **Intent contract**: `docs/INTENT.md` — every behavioural / billing-affecting change must update an Intent ID and at least one of the gates above.

