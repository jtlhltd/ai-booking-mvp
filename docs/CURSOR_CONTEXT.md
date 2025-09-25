\# Cursor Context — Vapi AI-Booking-MVP



\## Mission

Automated, multi-tenant lead follow-up: receive SMS, resolve tenant, opt-in via YES/START, trigger Vapi auto-call, book into Google Calendar, and keep clean logs. Safety over speed.



\## Core Goals

1\) Reliable inbound SMS handler with robust tenant resolution.

2\) Clean, structured logs to debug call flows.

3\) Minimal, surgical changes with diffs we can reason about.

4\) One-command “ship”: changelog → commit → push → (Render auto-deploy) → smoke test.

5\) Postgres source of truth for tenants (no hard-coded maps).



\## Key Endpoints (current/expected)

\- `POST /webhooks/twilio-inbound` — parse Body (YES/START/STOP), resolve tenant, trigger flows.

\- `POST /webhooks/twilio-status` — Twilio status callback.

\- `GET /health` | `GET /version` — sanity checks.

\- `GET /admin/tenant-resolve?to=...\&mss=...` — diagnostic lookup.

\- `GET /admin/check-tenants` — duplicates in `sms.fromNumber` / `messagingServiceSid` (admin only).

\- `GET /admin/changes` — runtime change feed (if present).



\## Tenant Resolution (required behavior)

Order of precedence:

1\) `X-Client-Key` (explicit override)

2\) `To` (E.164) == tenant `sms.fromNumber`

3\) `MessagingServiceSid` equals tenant `sms.messagingServiceSid`

On fail → `\[TENANT RESOLVE FAIL]` log + 200 OK without side effects.



\## Inbound Commands

\- YES / START → opt-in + auto-call (`\[LEAD OPT-IN YES]` / `\[LEAD OPT-IN START]` then `\[AUTO-CALL TRIGGER]`)

\- STOP / UNSUBSCRIBE → opt-out; block future auto-calls until new YES/START

\- Others → freeform; no auto-call



\## Logging Tags (use exactly)

\- Tenanting: `\[TENANT RESOLVE OK]` `\[TENANT RESOLVE AMBIGUOUS]` `\[TENANT RESOLVE FAIL]` `\[TENANT CHECK]`

\- Opt-in/out: `\[LEAD OPT-IN YES]` `\[LEAD OPT-IN START]` `\[LEAD OPT-OUT STOP]`

\- Actions: `\[AUTO-CALL TRIGGER]` `\[IDEMPOTENT SKIP]`

\- Ops: `\[CHANGE]` plus deploy/version markers



\## Phone Normalization

\- Use `normalizePhoneE164(input, 'GB')`. 

\- Behavior: strip spaces/non-digits (keep `+`), convert `00` → `+`, pass-through valid E.164, map GB `07xxxxxxxxx` → `+447xxxxxxxxx`, `0XXXXXXXXXX` → `+44XXXXXXXXXX`.

\- \*\*All returns inside the helper\*\*.



\## Acceptance Pattern (for any change)

\- Inputs: exact example payloads (From/To/Body, etc.)

\- Expected logs: list which tags should appear and with what key fields (tenantKey, leadId)

\- Outputs: 200/JSON; side-effects like Vapi trigger

\- Negative path: what should NOT happen (no call on STOP/fail)



\## Deploy \& Test Flow

1\) Update `CHANGELOG.md` (`## \[Unreleased]`).

2\) Commit \& push (Conventional Commit).

3\) Render auto-deploys or `Render: redeploy`.

4\) Smoke test: two tenants, START → call; STOP → no call.

5\) Tail logs filtered to key tags above.



\## Tooling

\- MCP: Render (tail logs, redeploy).

\- GitHub: Verified in Cursor (commit/push directly).

\- PowerShell probes for local/live testing.



