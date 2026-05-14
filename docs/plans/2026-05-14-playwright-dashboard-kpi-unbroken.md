# Playwright: dashboard KPI strip must not stay broken

## Context

- User reports the client dashboard KPI area is still broken on Render; we need **Playwright** to enforce correct behavior in CI/local.
- Prior fixes: early `updateStatusBar`, static hints default to `—`, secondary panel errors isolated; `jest.config` excludes `playwright-report` from coverage.

## Definition of done

- `npm run test:e2e` passes reliably (Chromium).
- At least one spec asserts **Key metrics** tiles: main values are not permanent placeholders and hint `#statusHintLeads` is not stuck on `Loading...` for the exercised URL(s).
- If local server is required, `playwright.config.mjs` `webServer` remains correct; failures produce actionable assertions.

## Non-goals

- Full visual regression of every chart.
- Testing production Render URL from CI (use local `webServer` + same HTML).

## Work breakdown

- [x] Inspect `playwright.config.mjs` and existing `e2e/*.spec.js`.
- [x] Add or extend E2E for `client-dashboard.html?client=demo_client` and/or `d2d-xpress-tom` with strict KPI assertions + reasonable timeouts.
- [x] Run `npm run test:e2e`; fix **product** (`public/client-dashboard.html`) or **test** until green; commit + push.

## Risk & rollback

- Risk: flaky timing on slow CI → use `expect.poll` / longer timeout only where needed.
- Rollback: revert the new/changed spec file and any small HTML tweaks from the same PR.

## Amendments

- **2026-05-14:** KPI strip stayed on `—` because `runClientDashboardBoot` only read `globalThis.__initClientDashboard`, which was only set inside the `client-dashboard-boot` listener. Fixed by assigning `globalThis.__initClientDashboard` / `globalThis.__stopClientDashboardLive` when wiring `__dashboardBootFns`, mirroring the bridge on `globalThis`, and falling back to `globalThis.__dashboardBootFns.init` in the boot IIFE before dispatching the custom event.
- **2026-05-14:** Added `window.load` fallback init when `#statusTotalLeads` is still the static placeholder, surfaced init failures via `globalThis.__dashboardShowInitFailure` + `#dashboardApiErrorBanner`, and deduped `initDashboard` after the scroll bootstrap so a missed `DOMContentLoaded` or silent rejection is less likely to leave an all-dash dashboard with no explanation.
- **2026-05-14:** Load fallback no longer bails when `__dashboardInitStarted` is true (that blocked retries when init started but never painted KPIs). Track `__dashboardKpiStripPainted` from `updateStatusBar`, defer fallback 50ms, detect more dash-like glyphs, and reset dedupe once for a single retry.
