# AI Lead Follow-Up & Booking Agent — MVP Skeleton

This matches your **Build-Optimized PRD v4**: Express backend with stubbed tools and endpoints.
Use it to wire up the Vapi agent immediately, then swap stubs for real integrations.

## Quick Start

```bash
cd ai-booking-mvp-skeleton
npm install
cp .env.example .env   # fill values later when adding real integrations
npm run dev            # or: npm start
```

Server listens on **http://localhost:3000**.

## Endpoints

- `POST /webhooks/new-lead` → triggers outbound call (stub) and stores lead
- `POST /api/calendar/check-book` → returns a stub booking slot + eventId
- `POST /api/notify/send` → stub notifier for sms/email
- `POST /api/crm/upsert` → writes disposition log
- `GET  /gdpr/delete?phone=+447700900123` → deletes lead/call data for that phone
- `GET  /health` → healthcheck

### Sample Payloads (PowerShell-safe)

**New Lead → triggers outbound call (stub):**
```powershell
$headers = @{ 'Content-Type' = 'application/json' }
$body = @'
{
  "name": "Jane Doe",
  "phone": "+447700900123",
  "email": "jane@example.com",
  "service": "Teeth Whitening"
}
'@
Invoke-RestMethod -Uri "http://localhost:3000/webhooks/new-lead" -Method Post -Headers $headers -Body $body
```

**calendar.checkAndBook (stub):**
```powershell
$lead = @{'id'='lead_test'; 'name'='Jane Doe'; 'phone'='+447700900123'; 'email'='jane@example.com'}
$payload = @{'service'='Teeth Whitening'; 'startPref'='soon'; 'durationMin'=30; 'lead'=$lead} | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/api/calendar/check-book" -Method Post -Headers $headers -Body $payload
```

**notify.send (stub):**
```powershell
$payload = @{'channel'='sms'; 'to'='+447700900123'; 'message'='Your appointment is confirmed for tomorrow 14:00.'} | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/api/notify/send" -Method Post -Headers $headers -Body $payload
```

**crm.upsert (stub):**
```powershell
$payload = @{'name'='Jane Doe'; 'phone'='+447700900123'; 'email'='jane@example.com'; 'disposition'='booked'} | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/api/crm/upsert" -Method Post -Headers $headers -Body $payload
```

**GDPR delete:**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/gdpr/delete?phone=%2B447700900123" -Method Get
```

## Wiring to Vapi (overview)

- Map tool calls to these routes:
  - `calendar.checkAndBook` → `POST /api/calendar/check-book`
  - `notify.send` → `POST /api/notify/send`
  - `crm.upsertLead` → `POST /api/crm/upsert`
- Point your incoming webhook that creates outbound calls to `POST /webhooks/new-lead`.

When ready, replace stubs with:
- Twilio / SendGrid clients inside `/api/notify/send`.
- Google Calendar client inside `/api/calendar/check-book`.
- Real persistence (Postgres) instead of `data/*.json`.

## Files

- `server.js` — Express app with all endpoints
- `data/leads.json` and `data/calls.json` — simple JSON stores
- `.env.example` — fill in when you enable real integrations
- `package.json` — scripts + deps

---

© 2025-09-08