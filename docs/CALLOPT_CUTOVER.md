# Tom app cutover (Call Bot split) — **closed**

Split is complete. Tom CRM runs on `d2d-xpress-app`; Call Bot is dial + `/api/v1` + consumer webhooks only.

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

## Post-cutover verification (2026-06-30)

| Check | Result |
|-------|--------|
| Call Bot deploy | `7fcaf09` live (`GET /api/build`) |
| Tom app health | `ok: true`, sheet + Call Bot configured |
| Vertical routes on Call Bot | `/follow-up-queue/*`, `/tools/*`, `/daily-summary/*` → **404** |
| Tom follow-up API | `GET /api/follow-up-queue` → 115 rows |
| Consumer webhook wiring | `d2d-xpress-tom` → `d2d-xpress-app-f02w` /webhooks/callbot, enabled |
| Signed webhook smoke | `SMOKE=1 node scripts/smoke/tom-cutover-smoke.mjs` → **200**, sheet append OK |
| Sheet backup | `D:\backups\ai-booking-mvp\20260630_sheet\logistics-sheet.json` (115 rows) |

**Still manual:** watch the next few **real** Vapi dials (tools on Tom, handoff on Tom dashboard).

Tom vertical route **files** were removed from Call Bot (rollback via git tag `pre-tom-split-2026-06-30`).
