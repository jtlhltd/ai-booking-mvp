# Context

- Replace deploy-and-screenshot loops with **automated DOM checks** for the static demo dashboard.
- **Recommendation adopted:** opt-in CI (manual `workflow_dispatch`) plus local `npm run test:e2e`; widen to every PR later once stable.

# Definition of done

- `npm run test:e2e` runs Playwright against a live server (`webServer` runs migrate + `node server.js` when `CI` is set, or reuses local server when not).
- Spec asserts demo dashboard **key metric hints** leave the static `Loading...` state and lead count tile shows seeded demo data.
- GitHub Actions workflow **E2E (Playwright)** runs only on **workflow_dispatch** with Postgres service + browser install.
- [`.cursor/rules/ide-browser-cleanup.mdc`](.cursor/rules/ide-browser-cleanup.mdc) points agents at `npm run test:e2e` for DOM smoke.
- `playwright-report/` and `test-results/` gitignored.

# Non-goals

- Full visual regression suite.
- Adding E2E to `npm run test:ci` in this iteration.

# Work breakdown

- [x] Persist this plan (this file).
- [x] Add `@playwright/test`, `playwright.config.mjs`, `e2e/dashboard-demo.spec.js`, npm scripts, `.gitignore` entries.
- [x] Add `.github/workflows/e2e-playwright.yml` (workflow_dispatch + postgres + `playwright install --with-deps chromium`).
- [x] Add `e2e/README.md` with local run prerequisites.
- [x] Update `ide-browser-cleanup.mdc`.
- [x] Run `npm run check:policy` and `npm run test:e2e` (local: `check:policy` OK; full browser install hit ENOSPC; optional `PLAYWRIGHT_CHANNEL=chrome` documented for partial installs).

# Risk & rollback

- **Risk:** Flaky timeouts on slow `/api/demo-dashboard`; mitigate with retries + `trace: on-first-retry`.
- **Rollback:** Remove workflow, `e2e/`, `playwright.config.mjs`, dependency, scripts, and gitignore lines.

# Amendments

- **2026-05-14:** Jest `testMatch` also picked up `e2e/*.spec.js`, breaking `npm run test:coverage` / `test:ci`. Added `/e2e/` to `jest.config.js` `testPathIgnorePatterns` and excluded `e2e/` from `collectCoverageFrom`.
- **2026-05-14:** Demo dashboard boot never assigned `globalThis.__initClientDashboard` (hook lived inside an extra brace scope that never ran). Fixed by registering a `client-dashboard-boot` listener at the top of the main inline script and dispatching that event from the boot `<script>` when the hook is missing; removed the dead mid-file hook assignment.
- **2026-05-14:** KPI strip still stayed on `—` when `runClientDashboardBoot` only consulted `globalThis.__initClientDashboard` (set inside the event handler). Wired `globalThis.__initClientDashboard` / `globalThis.__stopClientDashboardLive` at the same time as `__dashboardBootFns` assignments, mirrored `__dashboardBootFns` onto `globalThis`, and taught the boot IIFE to fall back to `globalThis.__dashboardBootFns.init` before dispatching the custom event.
