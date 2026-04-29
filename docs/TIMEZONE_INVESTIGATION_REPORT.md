# Timezone Investigation Report

## Scope
- Full codebase sweep of timezone interactions in tenant config, scheduling, dashboard display, and CSV export.
- Repro performed against local server using tenant `d2d-xpress-tom`.

## Canonical Contract (Proposed Baseline)

### Timezone precedence
Use one precedence everywhere for tenant-local behavior:
1. `client.booking.timezone`
2. `client.timezone`
3. environment fallback (`TZ`/`TIMEZONE`)
4. hard default (`Europe/London`)

### Semantics by surface
- Scheduling and business-hour gates: tenant-local timezone.
- Dashboard activity strip: explicit `activityTimezone` (only if intentionally different from tenant timezone).
- Lead/call/appointment display: explicit timezone labeling and explicit timezone formatter.
- CSV export: either
  - UTC ISO strings in dedicated columns, or
  - tenant-local formatted strings with explicit timezone column.
  Never implicit mixed serialization.

## Inventory: Where Timezone Is Used

### Config and source-of-truth
- `server.js`: `TIMEZONE` env default and `pickTimezone(client)`.
- `lib/business-hours.js`: `getTenantTimezone(tenant, fallback)` with booking/top-level/whiteLabel fallback chain.
- `db.js`: tenant mapping (`mapTenantRow`) and persistence (`upsertFullClient`) for `tenants.timezone` and `calendar_json.booking.timezone`.
- `routes/clients-api.js`: POST validation path requires timezone via `pickTimezone(c)` but error message says `booking.timezone is required`.

### Scheduling and operations
- `lib/optimal-call-window.js`: scheduling window selection and jitter.
- `lib/business-hours.js`: tenant-local open/closed checks and window clamping.
- `routes/daily-summary.js`: Postgres uses tenant-local day bounds (`AT TIME ZONE`), SQLite uses `datetime('now')`.
- `lib/outbound-queue-day-route.js`: tenant-local queue day grouping.
- `lib/calendar-find-slots.js` and `lib/calendar-check-book.js`: booking slot computation and default-time behavior.
- `routes/twilio-voice-webhooks.js` and `lib/inbound-call-router.js`: timezone conversion using `new Date(toLocaleString(...))`.

### Dashboard display
- `public/client-dashboard.html`:
  - `DASHBOARD_ACTIVITY_TZ` fallback.
  - `formatActivitySnapshot` (explicit timezone).
  - `formatTimeAgo` (browser local clock via `new Date()`).
  - `formatAppointmentTime` and `formatRecordingDateTime` (browser locale/timezone, no explicit `timeZone`).
  - config timezone resolution uses `timezone || booking.timezone`.
- `routes/demo-dashboard.js`:
  - computes with both `tenantTz` and `activityTzLabel`.
  - returns `config.timezone` using top-level before booking.

### Export paths
- `routes/core-api.js`: `/export/:type` exports `created_at`/`start_iso` raw values directly into CSV.
- `routes/admin-clients.js`: `/export/:type` exports raw rows and builds UTC-date filenames.
- `public/client-dashboard.html`:
  - `exportData(type)` uses `/api/export/:type`, filename day from `toISOString()`.
  - follow-up list CSV export is client-generated and includes dashboard-side notes/state.
- `sheets.js`: logistics row `Timestamp` is hardcoded to `Europe/London`.

## Confirmed Mismatch Risks

## 1) Config precedence drift (booking vs top-level)
- `routes/demo-dashboard.js` uses `tenantTz = booking.timezone || timezone`.
- Same payload sets `config.timezone = timezone || booking.timezone`.
- If both fields exist and differ, operational logic and UI can read different effective timezone values.

## 2) Mixed formatter domains in dashboard
- Some timestamps are rendered with explicit timezone (activity panels).
- Others render in browser-local timezone (appointments/recordings/relative labels).
- Result: same logical timeline can appear in mixed timezone semantics.

## 3) Export serialization mismatch
- `/api/export/leads` writes `row.created_at` directly; serialization reflects DB driver/runtime representation instead of a normalized contract.
- Dashboard cards often show relative or formatted tenant/activity time.
- Comparing UI and CSV can make rows look “different timezone” even when stored instants are the same.

## 4) SQLite/Postgres behavior divergence
- Postgres daily queue windows are tenant-local.
- SQLite branch computes against `datetime('now')` and lacks equivalent tenant-local boundaries.

## 5) Fragile timezone conversions
- `new Date(toLocaleString({ timeZone }))` appears in inbound/twilio paths and is locale/runtime fragile.

## 6) Hardcoded timezone writers
- `sheets.js` writes logistics `Timestamp` in `Europe/London`.
- Comparing sheet-driven data to DB-exported data may show mixed timezone appearance.

## Repro Diff (Completed)

### Setup
- Started local app with `npm start`.
- Queried:
  - `GET /api/demo-dashboard/d2d-xpress-tom?brief=1`
  - `GET /api/export/leads?clientKey=d2d-xpress-tom`
- Matched rows by phone number for first 25 dashboard leads.

### Observed
- Dashboard payload reports:
  - `activityTimezone = Europe/London`
  - `config.timezone = Europe/London`
- Exported lead `Created` values came back as strings like:
  - `Thu Apr 09 2026 10:15:41 GMT+0100 (British Summer Time)`
- These values are not normalized ISO strings and include locale/timezone text, while dashboard lead display uses relative labels and `Added DD/MM/YYYY` formatting.

### Classification
- Primary issue in repro: **export-only representation mismatch** (implicit string format), with secondary risk from **display/export contract mismatch**.
- Not a per-lead stored timezone field issue (leads table has no per-lead timezone column).

## Normalization Proposal (Implementation Order)

## P0: Contract and consistency guardrails
- Standardize tenant timezone precedence in one helper and reuse everywhere.
- Standardize API payload timezone fields:
  - `tenantTimezone`
  - `activityTimezone`
- Add tests for precedence when both booking and top-level timezone exist.

## P1: Export timestamp policy
- For all CSV exports:
  - include `created_at_utc` (ISO8601, always Z/offset), and
  - include `created_at_tenant_local` (formatted in tenant timezone), and
  - include `tenant_timezone`.
- Apply same policy to calls and appointments exports.

## P2: Dashboard rendering policy
- Replace browser-local formatting for operational timestamps with explicit timezone-aware formatter.
- Keep relative labels, but pair with explicit absolute timestamp + timezone indicator.

## P3: Scheduler parity and fragile conversion cleanup
- Align SQLite day-window semantics with Postgres tenant-local behavior where feasible.
- Replace `new Date(toLocaleString(...))` conversion pattern with Luxon timezone-safe conversion.
- Fix `calendar-find-slots` mixed UTC weekday/local hour logic.
- Fix `calendar-check-book` fallback default-start to truly use tenant timezone.

## P4: Cross-system labeling
- Where sheet timestamps are London-local by design, annotate exports/ingest metadata with source timezone.
- Add explicit timezone legend in dashboard help text for exports.

## Regression Checklist
- Tenant with identical booking/top-level timezone.
- Tenant with conflicting booking/top-level timezone.
- Non-UK timezone tenant (e.g., `America/New_York`) across:
  - demo dashboard payload fields,
  - queue/day summaries,
  - exports (`leads`, `calls`, `appointments`),
  - follow-up CSV export.
- DST boundary checks (spring/fall transition week).
- Postgres vs SQLite path sanity for daily summaries.

## Suggested Follow-up Work Items
- Add unit tests for timezone precedence helper use in:
  - `routes/demo-dashboard.js`
  - `routes/clients-api.js`
  - `lib/business-hours.js`
- Add contract tests for `/api/export/:type` timestamp columns and format guarantees.
- Add dashboard integration tests for explicit timezone formatting in key widgets.
