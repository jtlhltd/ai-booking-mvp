A Dependabot PR was opened. Triage only — do NOT auto-merge unless patch-level and all tests pass.

## Input (webhook JSON)
- `pullNumber`, `pullUrl`, `title`
- `repository` — jtlhltd/ai-booking-mvp
- `branch` — base branch (main)

## Steps
1. Check out the Dependabot branch for PR #<pullNumber>.
2. Run `npm run test:unit` and `npm run test:integration-lite`.
3. Read the diff — summarize breaking vs safe changes.
4. Comment on the PR via `gh pr comment <n> --body "..."` with:
   - Test results (pass/fail)
   - Risk: patch / minor / major
   - Recommendation: **merge** / **hold** / **close**
5. If tests fail: push a fix commit to the Dependabot branch OR open a separate fix PR — prefer minimal fix.
6. Slack summary with PR link and recommendation.

Hard rules:
- Never merge major version bumps without explicit HOLD in Slack.
- Never merge if test or test-windows would fail.
- Do not run full self-heal deploy loop — triage only unless tests fail for fixable GREEN reason.
