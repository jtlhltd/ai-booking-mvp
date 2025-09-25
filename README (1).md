# AI Booking MVP — Ops Runbook

This service is live on Render (free tier) with SQLite tenants bootstrapped from the `BOOTSTRAP_CLIENTS_JSON` env var.

## Day‑to‑day
- **Add tenant:** Update `BOOTSTRAP_CLIENTS_JSON` (JSON array) in Render → Save → Manual Redeploy.
- **List tenants:** `GET /api/clients` (requires `X-API-Key`).
- **Trigger agent call (Vapi):** `POST /webhooks/new-lead/:clientKey` with `{ name, phone, service, durationMin }`.
- **Auto-book + SMS:** `POST /api/calendar/check-book` with header `X-Client-Key` and body `{ service, durationMin, lead:{ name, phone } }`.

## Health & monitoring
- **/health** (auth) shows tenants & DB path.
- **/healthz** (no auth) shows integration flags.
- On free Render, first request can 503 (cold start). Add an external ping (UptimeRobot/Healthchecks.io) every 5 min to keep it warm.

## Environment variables (Render)
- `API_KEY` — required for API auth.
- `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY`/`GOOGLE_PRIVATE_KEY_B64`, `GOOGLE_CALENDAR_ID`
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID` or `TWILIO_FROM_NUMBER`
- `VAPI_PRIVATE_KEY`, `VAPI_ASSISTANT_ID`, `VAPI_PHONE_NUMBER_ID`
- `BOOTSTRAP_CLIENTS_JSON` — JSON array of tenants to seed on boot.

## Useful commands (PowerShell)
```powershell
# Health
Invoke-RestMethod "$env:BASE_URL/health" -Headers @{ 'X-API-Key' = $env:API_KEY }

# New agent call
$H=@{ 'X-API-Key'=$env:API_KEY; 'Content-Type'='application/json' }
$lead='{"name":"Jane Doe","phone":"+447491683261","service":"Dental Consultation","durationMin":30}'
Invoke-RestMethod "$env:BASE_URL/webhooks/new-lead/victory_dental" -Method POST -Headers $H -Body $lead -ContentType 'application/json'

# Auto-book tomorrow ~14:00 (Europe/London)
$H=@{ 'X-API-Key'=$env:API_KEY; 'X-Client-Key'='victory_dental'; 'Content-Type'='application/json' }
$body='{"service":"Dental Consultation","durationMin":30,"lead":{"name":"Jane Doe","phone":"+447491683261"}}'
Invoke-RestMethod "$env:BASE_URL/api/calendar/check-book" -Method POST -Headers $H -Body $body -ContentType 'application/json'
```

## Next improvements
- Add a free uptime pinger to `/healthz` to avoid cold-start 503s.
- Tune `express-rate-limit` per tenant to protect SMS/calls.
- Add `/api/logs/recent` to tail JSON logs for quick debugging.
- Move to a persistent disk (Render paid) or managed DB when ready.
