A Render deploy failed for ai-booking-mvp. Investigate logs, fix, and restore prod health.

## Input (webhook JSON)
- `serviceId` — srv-d2vvdqbuibrs73dq57ug
- `deploy.id`, `deploy.status` (build_failed | update_failed)
- `deploy.commit`, `deploy.message`
- `dashboardUrl` — Render deploy page

## Repo routing
- jtlhltd/ai-booking-mvp, branch main
- health: https://ai-booking-mvp.onrender.com/health/lb
- Render service: srv-d2vvdqbuibrs73dq57ug

## Steps
1. Use @[MCP: render] to fetch deploy logs for the failed deploy id.
2. Distinguish:
   - **Build failed** (tests/build on Render) → code or test fix on main
   - **Update failed** (runtime crash) → boot error, missing env, port bind
3. Compare failing commit to last known good deploy.
4. Risk tier: same as Sentry self-heal (GREEN merge ok for isolated fixes).
5. Fix, test locally, PR, `gh pr ready`, wait CI, merge GREEN, poll Render until live.
6. Verify `GET /health/lb` → 200 (3×).
7. Slack ✅ with deploy id, fix PR, and health check — no Sentry resolve unless a linked issue exists.

Hard rules:
- Do not re-trigger deploy by pushing unrelated changes.
- If env var missing on Render, report exact key — do not commit secrets.
