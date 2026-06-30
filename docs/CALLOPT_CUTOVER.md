# Tom app cutover (Call Bot split)

## Prerequisites

- Call Bot phase 1 deployed (`/api/v1`, consumer webhooks).
- Tom app (`d2d-xpress-app`) deployed with matching `WEBHOOK_SIGNING_SECRET`.
- Manual Google Sheet copy completed.

## Steps

1. **Call Bot** — set Tom tenant `consumer_webhook_json` in Postgres:
   ```sql
   UPDATE tenants
   SET consumer_webhook_json = '{"url":"https://YOUR-TOM-APP.onrender.com/webhooks/callbot","secret":"YOUR_SECRET","enabled":true,"events":["call.completed"]}'::jsonb
   WHERE client_key = 'd2d-xpress-tom';
   ```

2. **Tom app** — configure env: `CALLBOT_API_URL`, `CALLBOT_API_KEY`, `LOGISTICS_SHEET_ID`, `GOOGLE_SA_JSON_BASE64`, `WEBHOOK_SIGNING_SECRET`.

3. **Vapi** — point assistant tool server URL to Tom app (`/tools/access_google_sheet`, `/tools/schedule_callback`).

4. **Smoke test** — import one test lead via `POST /api/v1/leads`; confirm dial → webhook → sheet row in Tom dashboard.

5. **Disable core logistics writes** on Call Bot:
   ```
   LOGISTICS_SHEET_WRITES_IN_CORE=0
   DISABLE_TOM_VERTICAL_ROUTES=1
   ```

6. **Rollback** — set `LOGISTICS_SHEET_WRITES_IN_CORE=1`, `DISABLE_TOM_VERTICAL_ROUTES=0`, redeploy tag `pre-tom-split-2026-06-30` if needed.
