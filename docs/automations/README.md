# Cursor Automations — relay prompts & setup

Shared relay on Render: `https://ai-booking-mvp.onrender.com`

| Automation | Trigger | Relay path |
|------------|---------|------------|
| Sentry self-heal | Poller / Sentry webhook | `POST /webhooks/sentry-self-heal` |
| CI failed on main | GitHub Actions | `POST /webhooks/automation/github` |
| Dependabot PR | GitHub Actions | `POST /webhooks/automation/github` |
| Render deploy failed | Cron poller on Render | internal → deploy-failed webhook |

## GitHub repo secrets (Settings → Secrets → Actions)

| Secret | Value |
|--------|--------|
| `CURSOR_AUTOMATION_RELAY_URL` | `https://ai-booking-mvp.onrender.com` |
| `CURSOR_AUTOMATION_RELAY_SECRET` | Same as `SENTRY_SELF_HEAL_RELAY_SECRET` |

## Render env (via `.cursor/self-heal-secrets.env` + sync script)

Each automation needs its own Cursor webhook URL + auth from cursor.com/automations:

- `CURSOR_SELF_HEAL_WEBHOOK_URL` / `CURSOR_SELF_HEAL_WEBHOOK_AUTH` — already set
- `CURSOR_CI_FAIL_WEBHOOK_URL` / `CURSOR_CI_FAIL_WEBHOOK_AUTH` — new automation
- `CURSOR_DEPENDABOT_WEBHOOK_URL` / `CURSOR_DEPENDABOT_WEBHOOK_AUTH` — new automation
- `CURSOR_DEPLOY_FAIL_WEBHOOK_URL` / `CURSOR_DEPLOY_FAIL_WEBHOOK_AUTH` — new automation
- `RENDER_DEPLOY_FAIL_POLLER_ENABLED=true` — optional, needs `RENDER_API_KEY` on service
- `RENDER_SERVICE_ID=srv-d2vvdqbuibrs73dq57ug`

## Create automations in Cursor

1. [cursor.com/automations](https://cursor.com/automations) → **New automation**
2. Trigger: **Webhook**
3. Copy webhook URL + auth → paste into secrets env above
4. Paste prompt from:
   - [ci-failed.md](./ci-failed.md)
   - [dependabot-triage.md](./dependabot-triage.md)
   - [deploy-failed.md](./deploy-failed.md)
