# Context

- User wants a **repo rule** so the agent always **closes Cursor IDE browser tabs** and **stops local dev servers** after verification.
- After adding the rule, **re-test** the client dashboard on localhost.

# Definition of done

- New rule file under `.cursor/rules/` with `alwaysApply: true` describing browser tab cleanup + port cleanup.
- Dashboard smoke check: server starts, IDE browser loads demo dashboard, evidence recorded (search or console), then **all browser tabs closed** and **server stopped**.

# Non-goals

- Fixing IDE browser limitations if metrics still do not paint in Glass.
- Changing dashboard product code in this task unless a regression appears.

# Work breakdown

- [x] Add `.cursor/rules/ide-browser-cleanup.mdc`.
- [x] Run local server, open dashboard in IDE browser, verify, close tabs, kill listener on port 3000.
- [x] Commit and push the new rule (and this plan if included).

# Amendments

- IDE browser smoke test: `/api/demo-dashboard/demo_client` returned **200** from curl; in-page search did **not** find demo strings (`Jordan Hale`, `Last 24h`) within ~6s — same Glass browser limitation as before; use Chrome for definitive UI proof.

# Risk & rollback

- **Risk:** None; delete the `.mdc` file to rollback.
