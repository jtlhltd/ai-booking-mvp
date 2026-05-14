# Playwright E2E (dashboard)

## Local

Prerequisites match a normal app boot: **`DATABASE_URL`**, **`API_KEY`**, and (for Postgres) **`DB_TYPE=postgres`**. Copy from your `.env` or use the same Postgres URL you use for development.

```bash
npx playwright install chromium
npm run test:e2e
```

If `npx playwright install` fails (for example disk space) but Google Chrome is installed, you can point Playwright at the system browser:

```powershell
$env:PLAYWRIGHT_CHANNEL = "chrome"
npm run test:e2e
```

Playwright starts the server via `webServer` in [playwright.config.mjs](../playwright.config.mjs) (`node run-migration.js && node server.js`) unless one is already listening (non-CI only). The spawned process defaults to **`DB_TYPE=postgres`** and the `DATABASE_URL` from your environment or the same default URL as CI. To use **SQLite** instead (no local Postgres), set `PLAYWRIGHT_DB_TYPE=sqlite` and ensure `better-sqlite3` native bindings are built for your Node version (Node 20 + build tools per repo README).

Debug UI:

```bash
npm run test:e2e:ui
```

## CI (opt-in)

Run the **E2E (Playwright)** workflow from the GitHub **Actions** tab (**workflow_dispatch**). It starts Postgres, installs Chromium + OS deps, migrates, serves the app, then runs this folder.

After the workflow is stable, you can widen triggers (e.g. every `pull_request`) in [.github/workflows/e2e-playwright.yml](../.github/workflows/e2e-playwright.yml).
