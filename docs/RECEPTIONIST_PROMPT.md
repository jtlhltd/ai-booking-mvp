# Receptionist Prompt Guide

The backend now injects contextual variables so a single Vapi assistant can handle inbound receptionist calls, follow-up callbacks, and voicemail recovery. Use this guide when crafting or updating the assistant prompt.

## Modes (`CallPurpose`)

| Value | When it’s sent | Recommended behaviour |
| --- | --- | --- |
| `inbound_reception_new` | New caller during routing (no CRM match) | Run full intake: confirm name, number, service + availability, then book or take message. |
| `inbound_reception_existing` | Caller matched in CRM | Offer personalised greeting, reference last appointment, skip redundant questions. |
| `lead_followup` | Outbound follow-up launched via `/webhooks/new-lead/:clientKey` | Acknowledge prior enquiry, verify readiness to book, reuse requested service/timing. |
| `voicemail_callback` | (Reserve for future callback automation) | Let caller know you’re returning the call, confirm details, rebook if needed. |

Always branch the opening script and confirmation language based on `CallPurpose`. If the variable is missing, fall back to receptionist behaviour.

## Context Variables

Injected via `assistantOverrides.variableValues`:

- `CallPurpose`, `CallIntentHint` (comma-separated hints such as `service:Swedish Massage`, `after_hours`, `status:needs_followup`).
- `ClientKey`, `BusinessName`, `BusinessPhone`, `Timezone`, `Locale`.
- `CallerName`, `CallerPhone`, `IsKnownCustomer`, `TimeContext`.
- `LastAppointment`, `PreferredService` (if known), `PreviousStatus`, `LeadSource`.
- `ServicesJSON`, `PricesJSON`, `HoursJSON`, `ClosedDatesJSON`, `FAQJSON`, `ScriptHints`.
- `DefaultService`, `DefaultDurationMin`, `Currency`, `ConsentLine`.

Use the hints to decide whether to:
- Offer the next available slot.
- Surface past booking (“I can see you last visited on {{LastAppointment}}…”).
- Collect missing contact info (if `CallerPhone` missing or `IsKnownCustomer=false`).

## Tools & Expected Usage

The assistant can call the following functions (handled by `lib/vapi-function-handlers.js`):

- `lookup_customer`, `lookup_appointment`, `get_upcoming_appointments`
- `calendar_checkAndBook` (via tool call), `reschedule_appointment`, `cancel_appointment`
- `notify_send` (SMS/email confirmations), `take_message` for voicemail or handoff
- FAQ utilities: `get_business_info`, `get_business_hours`, `get_services`, `answer_question`

### Booking Flow Tips
1. On booking or reschedule, always call `calendar_checkAndBook` with `slot.start` as an ISO timestamp (Europe/London) plus a human-readable `startPref`.
2. Confirm the returned slot start to the caller; then send the SMS using `notify_send`.
3. If the calendar tool returns a conflict or error, apologise once and offer to take a message or escalate.

### Cancellation / Message Handling
- When a caller just needs to cancel, call `cancel_appointment` and confirm.
- If they request a callback or the assistant cannot book, call `take_message`, capture the reason, and let them know a human will reach out.

## Error Recovery

- If any tool fails twice, apologise and offer transfer. Use the handover number exposed elsewhere in the prompt.
- When context variables are missing (e.g., `CallerName` empty), ask for the information rather than assuming.
- After-hours (`TimeContext=after_hours`) scripts should acknowledge limited staffing and offer message taking.

## Prompt Skeleton (Example)

```
System directives:
- Read CallPurpose and CallIntentHint before speaking.
- Use BusinessName in greetings (“Welcome to {{BusinessName}}”).
- If CallPurpose == inbound_reception_new → run intake, gather contact, book.
- If CallPurpose == inbound_reception_existing → greet by CallerName, check LastAppointment, offer next slot.
- If CallPurpose == lead_followup → reference prior enquiry, confirm readiness, go straight to booking.
- Always confirm service/date/time in Europe/London and mention cancellation policy.
- Use notify_send after successful booking/reschedule.
- If booking fails, use take_message and note the issue.
```

Adjust the wording per tenant brand voice, but keep the branching logic so the assistant behaves correctly across all call types.



















