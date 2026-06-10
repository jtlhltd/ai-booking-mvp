A GitHub CI workflow failed on `main`. Investigate, fix, and open a PR. Do NOT merge unless the fix is clearly safe (GREEN tier).

## Input (webhook JSON)
- `repository` — e.g. jtlhltd/ai-booking-mvp
- `branch` — should be main
- `workflow` — e.g. CI
- `runId`, `runUrl` — failed GitHub Actions run
- `commit` — failing SHA

## Steps
1. Open `runUrl` context via `gh run view <runId> --log-failed` on jtlhltd/ai-booking-mvp.
2. Identify the failing job (test, test-windows, route inventory, etc.) and root cause.
3. Risk tier (docs/INTENT.md):
   - GREEN: test fix, typo, flaky test hardening, probe/route helper — may merge after CI green.
   - YELLOW: PR only, Slack summary, no merge.
   - RED: Slack only — no PR (dial, queue, tenant, billing).
4. Fix on branch from `main`, run `npm run test:unit` and `npm run test:integration-lite` locally in cloud VM.
5. Open PR: `fix(ci): <short description> (run <runId>)`
6. `gh pr ready <n>` immediately.
7. GREEN only: wait for CI test + test-windows (not coverage), then `gh pr merge <n> --squash --admin`.
8. Slack ✅ with PR URL, failing job name, and fix summary — or ❌ if YELLOW/RED.

Hard rules:
- Never merge with failing required checks.
- Never touch unrelated files.
- One PR per failed run id.
