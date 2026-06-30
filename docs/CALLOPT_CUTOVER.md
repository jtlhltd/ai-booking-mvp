# Tom app cutover (Call Bot split) — **completed**

## Architecture

- **Call Bot** (`ai-booking-mvp`): dial, queue, `/api/v1`, Vapi webhooks, `call.completed` consumer webhooks.
- **Tom app** (`d2d-xpress-app`): sheets CRM, follow-up queue, Vapi tools (`save_logistics_data`, `schedule_callback`).

## Production state

- Tom tenant `consumer_webhook_json` → `https://d2d-xpress-app-f02w.onrender.com/webhooks/callbot`
- Vapi tools → Tom app URLs
- Call Bot: `LOGISTICS_SHEET_WRITES_IN_CORE` unset or `0` (default off in code)
- Tom vertical routes **removed** from Call Bot mounts (not env-gated)

## Rollback (emergency)

1. Render `ai-booking-mvp`: `LOGISTICS_SHEET_WRITES_IN_CORE=1`
2. Redeploy tag `pre-tom-split-2026-06-30` if mounts must return
3. Point Vapi tool URLs back to Call Bot `/tools/*` temporarily

## Smoke test checklist

1. Import one lead via Tom app or `POST /api/v1/leads`
2. Complete call → sheet row in Tom app → follow-up queue on Tom dashboard
3. Confirm Call Bot logs show consumer webhook delivery, no core sheet append
