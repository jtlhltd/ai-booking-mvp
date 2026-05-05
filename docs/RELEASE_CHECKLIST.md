# Release checklist (high confidence)

This checklist is designed for non-coders: it turns “does it work?” into a small set of repeatable pass/fail checks.

## 0) Preconditions
- Use **Node 18 or 20** (matches CI).
- Ensure dependencies are installed: `npm ci`
- If you use Postgres locally, ensure `DATABASE_URL` is set and migrations are applied: `node run-migration.js`

## 1) Automated gate (must pass)
- Run: `npm test`
- Expected: **all tests pass**

## 2) Coverage report (visibility, not a hard gate yet)
- Run: `npm run test:coverage`
- Expected: command succeeds and generates a coverage report locally (HTML under `coverage/`).

## 3) Local smoke run (requires server running)
1. Start the server: `npm start`
2. In a separate terminal, run: `npm run smoke:local`

Expected:
- `/health` returns JSON with a `status`
- `/healthz` returns OK
- `/health/readiness` is requested when available (503 is acceptable if dependencies are down)
- key pages load: `/`, `/onboarding-wizard`, `/client-dashboard`, `/tenant-dashboard`
- if `API_KEY` is set in your environment, admin endpoints also respond:
  - `/admin/system-health`
  - `/admin/metrics`

## 4) Manual acceptance (quick)
Run and follow: `tests/manual/test-manual-checklist.ps1`

This is the human “does the product feel correct?” layer (onboarding + dashboards + SMS flows + integration sanity).

