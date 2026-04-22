# Entrypoint burn-down (what must be tested)

This is the systematic checklist for “test the whole codebase” in a meaningful way:
we test **entrypoints** (HTTP/webhooks/jobs), not random utility files.

## Baseline (current)
- `npm test`: passing
- `npm run test:coverage`: passing, but overall coverage is very low (single digits). Most `routes/` and `lib/` remain untested.

## A) HTTP routers (`routes/*.js`)
Total route modules: **87**

Checklist (mark ✅ when a file has at least 1 happy-path contract test and 1 failure-path test):
- [ ] `routes/admin-analytics-advanced.js`
- [ ] `routes/admin-appointments.js`
- [ ] `routes/admin-calendar.js`
- [ ] `routes/admin-call-queue-ops.js`
- [ ] `routes/admin-call-queue.js`
- [ ] `routes/admin-call-recordings.js`
- [ ] `routes/admin-calls-insights.js`
- [ ] `routes/admin-clients.js`
- [ ] `routes/admin-documents-comments-fields.js`
- [ ] `routes/admin-email-tasks-deals.js`
- [ ] `routes/admin-follow-ups.js`
- [ ] `routes/admin-lead-scoring.js`
- [ ] `routes/admin-multi-client.js`
- [ ] `routes/admin-operations.js`
- [ ] `routes/admin-outbound-weekday-journey.js`
- [ ] `routes/admin-overview.js`
- [ ] `routes/admin-reminders.js`
- [ ] `routes/admin-reports.js`
- [ ] `routes/admin-roi-calculator.js`
- [ ] `routes/admin-sales-pipeline.js`
- [ ] `routes/admin-social.js`
- [ ] `routes/admin-templates.js`
- [ ] `routes/admin-test-lead-data.js`
- [ ] `routes/admin-test-script.js`
- [ ] `routes/admin-validate-call-duration.js`
- [ ] `routes/analytics.js`
- [ ] `routes/api-docs.js`
- [ ] `routes/appointments.js`
- [ ] `routes/available-slots.js`
- [ ] `routes/backend-status.js`
- [ ] `routes/book-demo.js`
- [ ] `routes/booking-test.js`
- [ ] `routes/branding.js`
- [ ] `routes/calendar-api.js`
- [ ] `routes/call-recordings-stream.js`
- [ ] `routes/call-recordings.js`
- [ ] `routes/call-time-bandit.js`
- [ ] `routes/clients-api.js`
- [ ] `routes/clients.js`
- [ ] `routes/core-api.js`
- [ ] `routes/crm.js`
- [ ] `routes/create-client.js`
- [ ] `routes/daily-summary.js`
- [ ] `routes/demo-setup.js`
- [ ] `routes/follow-up-queue.js`
- [ ] `routes/google-places-test.js`
- [ ] `routes/health-and-diagnostics.js`
- [ ] `routes/health.js`
- [ ] `routes/import-lead-email.js`
- [ ] `routes/import-leads-csv.js`
- [ ] `routes/import-leads.js`
- [ ] `routes/industry-comparison.js`
- [ ] `routes/leads-followups.js`
- [ ] `routes/leads.js`
- [ ] `routes/monitoring-dashboard.js`
- [ ] `routes/monitoring.js`
- [ ] `routes/next-actions.js`
- [ ] `routes/ops-health-and-dnc.js`
- [ ] `routes/ops.js`
- [ ] `routes/outreach.js`
- [ ] `routes/pipeline-retry.js`
- [ ] `routes/pipeline-tracking.js`
- [ ] `routes/quality-alerts.js`
- [ ] `routes/quick-win-metrics.js`
- [ ] `routes/receptionist.js`
- [ ] `routes/recordings-quality-check.js`
- [ ] `routes/reports.js`
- [ ] `routes/retry-queue.js`
- [ ] `routes/roi.js`
- [ ] `routes/sms-email-pipeline.js`
- [ ] `routes/sms-templates.js`
- [ ] `routes/static-pages.js`
- [ ] `routes/twilio-voice-webhooks.js`
- [ ] `routes/twilio-webhooks.js`
- [ ] `routes/vapi-dev.js`
- [ ] `routes/vapi-webhooks.js`
- [ ] `routes/voicemails.js`
- [ ] `routes/zapier-webhook.js`

## B) Inline `server.js` routes
There are **many** inline `app.get/app.post/...` handlers in `server.js` (counted via grep).

Approach:
- Prefer migrating them into routers over time, but in the short term we’ll add contract tests for the most important ones first:
  - health/build/time endpoints
  - admin surfaces used for operations
  - any endpoints that mutate booking/leads/queues

## C) Webhooks (special rules)
These must have extra tests for signature verification, idempotency, retry behavior:
- `routes/twilio-webhooks.js`
- `routes/twilio-voice-webhooks.js`
- `routes/vapi-webhooks.js`

## D) Scheduled jobs (`lib/scheduled-jobs.js`)
Each schedule is an entrypoint. Tests should validate:
- jobs register with the expected cron expressions
- job bodies call the expected dependency functions
- failures are caught and logged (no crash)

