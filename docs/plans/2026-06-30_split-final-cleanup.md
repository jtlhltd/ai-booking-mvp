# Split final cleanup

## Context

- Tom / Call Bot split is live; vertical mounts already removed from Call Bot.
- Dead Tom route modules and their contract tests remain in Call Bot for historical coverage.
- Smoke script + cutover verification doc are uncommitted.

## Definition of done

- Tom vertical route files deleted from Call Bot (`follow-up-queue`, `daily-summary`, `tools-mount`, `admin-vapi-logistics-mount`).
- Associated contract tests removed; `batch2-routes` trimmed.
- Policy + unit gate forbid remounting **and** re-adding those route files.
- `scripts/smoke/tom-cutover-smoke.mjs` committed; `CALLOPT_CUTOVER.md` marks split **closed**.
- `npm run test:ci` green; changes pushed to `main`.

## Non-goals

- Delete shared libs (`logistics-extractor`, `sheets.js`) — still used for rollback flag path.
- Live Vapi dial during this cleanup.

## Work breakdown

- [x] Delete 4 Tom vertical route modules + 4 dedicated contract tests
- [x] Trim `batch2-routes.contract.test.js` Tom sections
- [x] Extend policy + `consumer-split-policy.test.js`
- [x] Commit smoke script + doc updates
- [x] `npm run test:ci` + push

## Risk & rollback

- **Risk:** Removing routes makes git-only rollback harder (must use tag `pre-tom-split-2026-06-30`).
- **Rollback:** Redeploy pre-split tag; Tom app can stay up.
