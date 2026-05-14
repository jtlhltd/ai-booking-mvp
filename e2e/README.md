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

Playwright starts the server via `webServer` in [playwright.config.mjs](../playwright.config.mjs) (`node run-migration.js && node server.js`) unless one is already listening (non-CI only).

Debug UI:

```bash
npm run test:e2e:ui
```

## CI (opt-in)

Run the **E2E (Playwright)** workflow from the GitHub **Actions** tab (**workflow_dispatch**). It starts Postgres, installs Chromium + OS deps, migrates, serves the app, then runs this folder.

After the workflow is stable, you can widen triggers (e.g. every `pull_request`) in [.github/workflows/e2e-playwright.yml](../.github/workflows/e2e-playwright.yml).
