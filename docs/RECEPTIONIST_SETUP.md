# Receptionist Rollout Guide

This guide explains how to launch the receptionist-capable assistant for a new tenant, from configuration through testing.

## 1. Environment & Config

1. **Required env vars**
   - `VAPI_PRIVATE_KEY`, `VAPI_ASSISTANT_ID`, `VAPI_PHONE_NUMBER_ID`
   - `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`
   - `API_KEY` (used for harness + admin endpoints)
   - Optional overrides:
     - `VAPI_FORWARD_NUMBER` (number that bridges inbound calls to Vapi)
     - `RECEPTIONIST_TELEMETRY_PATH` (custom path for telemetry log)
2. **Tenant record**
   - Ensure the tenant’s phone numbers are listed in `tenants.numbers_json` so the inbound router can resolve the client.
   - Populate `servicesJson`, `pricesJson`, `hoursJson`, `faqJson`, `scriptHints`, `booking.defaultDurationMin`, etc. These feed directly into the prompt via `assistantOverrides.variableValues`.
3. **CRM syncing**
   - Confirm migrations have run so `inbound_calls`, `messages`, `customer_profiles`, and `appointments` tables exist. The receptionist tooling reads/writes these tables for lookups and voicemails.

## 2. Vapi Prompt Configuration

The backend injects contextual variables for every call:

| Variable | Description |
| --- | --- |
| `CallPurpose` | One of `inbound_reception_new`, `inbound_reception_existing`, `lead_followup` (future: `voicemail_callback`). |
| `CallIntentHint` | Comma-separated hints (e.g., `service:Swedish Massage,after_hours`). |
| `CallerName`, `CallerPhone`, `IsKnownCustomer`, `LastAppointment`, `PreferredService`. |
| Business data (`BusinessName`, `BusinessPhone`, `Timezone`, `ServicesJSON`, `PricesJSON`, `HoursJSON`, `ClosedDatesJSON`, `FAQJSON`, `ScriptHints`, etc.). |

Prompt guidelines:
1. Branch opening lines and dialogue based on `CallPurpose`.
2. Use `CallIntentHint` to prioritise actions (offer previously requested service, note after-hours messaging, etc.).
3. Booking/reschedule/cancel flows should call the tools referenced in `docs/RECEPTIONIST_PROMPT.md`, confirm the returned slot, and send a confirmation SMS with `notify_send`.
4. If any tool fails twice, apologise once and offer transfer using the business handover number.

## 3. Inbound Call Flow

1. **Twilio → `/webhooks/twilio-voice-inbound`**  
   - Numbers are normalised to E.164.
   - `routeInboundCall` sets `CallPurpose`, intent hints, and resolves the correct assistant ID/phone number ID.
   - Telemetry events (`receptionist.call_routed`, `receptionist.twilio_inbound`) are logged automatically.
2. **`createVapiInboundCall`**  
   - Creates the Vapi call, logging success/failure (`receptionist.call_initiated`, `receptionist.call_initiate_failed`).
   - If `VAPI_FORWARD_NUMBER` is configured, the TwiML bridges to that number; otherwise Twilio receives an empty `<Response/>` for Vapi to handle.
3. **Vapi webhook → `/webhooks/vapi`**  
   - Records call quality and writes telemetry (`receptionist.call_webhook`, `receptionist.tool_call`).
   - Tool calls are routed through `lib/vapi-function-handlers.js`, enabling lookups, bookings, cancellations, messages, and FAQs.
4. **Twilio statuses / voicemail**  
   - `/webhooks/twilio-voice-status` updates the database and logs `receptionist.twilio_status`.
   - `/webhooks/twilio-voice-recording` stores voicemail data, transcribes when available, and emits `receptionist.voicemail` or `receptionist.voicemail_error`.

## 4. Outbound Follow-Up Flow

Use `/webhooks/new-lead/:clientKey` with:
```json
{
  "phone": "+447700900123",
  "name": "Prospect Name",
  "service": "Swedish Massage",
  "intentHint": "service:Swedish Massage, follow_up",
  "previousStatus": "needs_followup"
}
```

The endpoint:
1. Normalises the phone number.
2. Sets `CallPurpose='lead_followup'` plus the intent hints and metadata.
3. Launches the Vapi call and records telemetry (`receptionist.outbound_launch`, `receptionist.outbound_response`, errors if any).

## 5. Telemetry & Monitoring

- **Admin endpoints**
  - `GET /admin/receptionist-telemetry?limit=50` – latest events.
  - `DELETE /admin/receptionist-telemetry` – reset between tests.
- Event types include `call_routed`, `call_initiated`, `call_webhook`, `tool_call`, `twilio_inbound`, `twilio_status`, `voicemail`, and outbound events.
- For demo recordings you can still use `/admin/demo-telemetry`; receptionist telemetry is separate and always on.

## 6. Test Harness

1. Ensure the API is reachable (local or Render) and that `API_KEY` is known.
2. Run:
   ```bash
   node tests/receptionist-harness.js --baseUrl=https://your-app.onrender.com --tenant=test_client --apiKey=YOUR_API_KEY
   ```
   The harness will:
   - Clear receptionist telemetry.
   - Simulate a Twilio inbound call.
   - Trigger an outbound follow-up launch.
   - Print the resulting telemetry events.
3. Review `/admin/receptionist-telemetry` (or the log file) to validate the event stream.

## 7. Rollout Checklist

1. Configure env vars and tenant metadata.
2. Update the Vapi prompt using the branching guidance above.
3. Point the tenant’s Twilio number to `/webhooks/twilio-voice-inbound`.
4. Test inbound + outbound flows with the harness and/or a real phone call.
5. Monitor telemetry and database tables (`inbound_calls`, `messages`, `appointments`) for expected entries.
6. Train support staff on the handoff process (voicemail notifications, manual callbacks).

Following these steps ensures the assistant can handle inbound receptionist duties, outbound lead follow-up, and provides the observability needed for confident demos or production use.








