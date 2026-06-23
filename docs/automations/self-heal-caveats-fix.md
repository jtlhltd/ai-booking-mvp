# Fix self-heal caveats: Render MCP + integration-lite

## Caveat 1: Render MCP unauthorized / no workspace

Render is **MCP-only** in Cursor (no separate Integrations tile like Sentry/GitHub). Skip dashboard Integrations — **B + C below are enough**.

### A. ~~Cursor Dashboard — Integrations~~ (not available)

Render connects via the **Render MCP plugin** in automation Tools (step B), not cursor.com/dashboard → Integrations.

### B. Automation — Tools

1. Open [cursor.com/automations](https://cursor.com/automations) → **Sentry self-heal — full loop**
2. Under **Tools**, enable **Render** (MCP plugin)
3. Click **Authenticate** if prompted
4. Save automation

### C. Cloud Agent secrets (API fallback)

Add to [Cloud Agents → My Secrets](https://cursor.com/dashboard?tab=cloud-agents):

| Name | Value |
|------|--------|
| `RENDER_API_KEY` | Your Render API key (`rnd_...`) |
| `RENDER_SERVICE_ID` | `srv-d2vvdqbuibrs73dq57ug` |

Same key works for MCP and curl fallback.

### D. Prompt — step 6 deploy poll (paste into automation)

Replace the Render deploy section with:

```text
## 6. Ship GREEN only (deploy confirmation)

After merge:
1. PRIMARY — @[MCP: render]:
   - If workspace not selected: list_workspaces() then select the workspace containing ai-booking-mvp
   - list_deploys(serviceId="srv-d2vvdqbuibrs73dq57ug", limit=3)
   - Wait until latest deploy status=live and commit matches merged PR SHA

2. FALLBACK if Render MCP unauthorized or no workspace:
   curl -s -H "Authorization: Bearer $RENDER_API_KEY" \
     "https://api.render.com/v1/services/srv-d2vvdqbuibrs73dq57ug/deploys?limit=1"
   - Require status=live and deploy.commit.id starts with merged SHA (first 7 chars OK)

3. Do not proceed to resolve until deploy is live OR health/lb already proves the fix (3× 200).
```

---

## Caveat 2: integration-lite unrelated failures

### Root cause

`tests/routes/vapi-webhooks.middleware.contract.test.js` can exceed Jest’s default **30s** timeout when the full integration-lite suite runs under load (~4s alone, >30s when contended).

### Fix (in repo)

Timeout raised to **60s** for that test (commit on main).

### Prompt — step 4 tests (paste into automation)

```text
## 4. Fix + test

Before PR:
- npm run test:unit — must pass
- npm run test:integration-lite — must pass

If integration-lite fails ONLY on vapi-webhooks.middleware.contract.test.js with timeout:
- Re-run once: npm test -- tests/routes/vapi-webhooks.middleware.contract.test.js
- If pass on re-run and your change does not touch routes/vapi-webhooks.js or vapi-webhooks/*, treat as flaky infra (Slack note) and continue for GREEN probe fixes only.
- If fail twice OR you changed vapi webhook code, fix before PR.

Never merge if test or test-windows CI jobs fail on GitHub.
```

---

## Quick verify

| Check | How |
|-------|-----|
| Render MCP | New automation run → tools show `list_deploys` success |
| API fallback | Cloud agent has `RENDER_API_KEY` in secrets |
| integration-lite | `npm run test:integration-lite` exits 0 locally |
