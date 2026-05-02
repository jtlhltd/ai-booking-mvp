# How to Run the AI Booking System

Single reference for running the app locally, deploying to Render, and verifying production.

---

## Required environment variables

Set these in `.env` (local) or in the Render dashboard (production). Minimum to run:

| Variable | Purpose | Example |
|----------|---------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/dbname` |
| `API_KEY` | Admin API key for protected routes | (any secret string) |
| `VAPI_PRIVATE_KEY` or `VAPI_API_KEY` | Vapi AI voice API | From Vapi dashboard |
| `VAPI_ASSISTANT_ID` | Default assistant ID | From Vapi dashboard |
| `TWILIO_ACCOUNT_SID` | Twilio account | From Twilio console |
| `TWILIO_AUTH_TOKEN` | Twilio auth | From Twilio console |
| `TWILIO_FROM_NUMBER` | SMS sender number | E.164 format |
| `YOUR_EMAIL` | Where alerts and reports are sent | Your email |

Optional but common: `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY` (or `GOOGLE_PRIVATE_KEY_B64`), `EMAIL_USER`, `EMAIL_PASS` (for sending email), `BASE_URL`, `PORT` (default 3000).

Generate a full template:

```bash
node scripts/generate-env-template.js
```

---

## Run migrations

**Always run migrations before starting the app** when the schema or migrations have changed (e.g. after pull).

```bash
node run-migration.js
```

Requires `DATABASE_URL` in the environment. Migrations run automatically on Render before start (see `render-start` in `package.json`).

---

## Run locally

```bash
npm install
cp .env.example .env   # then edit .env
node run-migration.js
npm start
```

Server listens on `http://localhost:3000` (or `PORT`).

**SQLite locally:** If you are not using Postgres (`DATABASE_URL` unset), the app uses **`data/app.db`**. That file is **not** in git (see `.gitignore`); it is created on first run. After a fresh clone you do not need to add it manually.

**Admin tenant list:** `GET /api/clients` with an API key that has admin clients permission returns a paginated slice of all tenants. Query params: `limit` (1–500, default 500), `offset` (0–500000). The response includes `total`, `count`, `limit`, `offset`, `truncated`, and `clients` (see [routes/clients-api.js](../routes/clients-api.js)).

---

## Deploy to Render

1. Connect the GitHub repo to Render (Web Service).
2. **Build command:** The repo’s `render.yaml` runs **`npm ci --include=dev && npm test`** so devDependencies (Jest) are installed and **tests must pass** before the deploy succeeds. If you configure the service manually and want the same behavior, use that command; use `npm ci` only if you intentionally skip tests on Render (GitHub Actions still runs them on push/PR).
3. **Start command:** `npm run render-start` (runs migrations then `node server.js`).
4. In Render **Environment** tab, add all required variables (see above). Include `DATABASE_URL` from the Render Postgres instance if using it.
5. Deploy. Render will set `RENDER_GIT_COMMIT` to the deployed commit.

The repo’s `render.yaml` uses **`npm run render-start`** so migrations run before the server starts (same as the manual start command above).

**Local Node version:** `.nvmrc` / `.node-version` are **20.16.0** (recommended for dev + tests; avoids native addon build friction). With [nvm](https://github.com/nvm-sh/nvm) or [fnm](https://github.com/Schniz/fnm): `nvm use` / `fnm use`.

---

## GitHub: CI and branch protection (recommended)

- **CI:** Pushes and pull requests to `main` / `master` run **GitHub Actions** (`.github/workflows/ci.yml`). Check results under the repo **Actions** tab or on the PR **Checks** section.
- **Branch protection:** In GitHub: **Settings → Branches → Branch protection rules** (or **Rulesets**) for `main`. Enable **Require status checks to pass before merging** and select the **CI** jobs (e.g. `test`). That way failing tests block merges even though Render deploys independently.
- **Dependabot:** `.github/dependabot.yml` opens weekly npm dependency update PRs; review and merge as you like.

### Test tiers / commands

Recommended tiers (in increasing “integration” level):

- **Tier 1 (fast, always)**: unit tests
  - `npm run test:unit`
- **Tier 2 (always runnable, Windows-friendly)**: contract tests
  - `npm run test:integration-lite` (runs `tests/routes/**` + `tests/db/**`)
- **Tier 3 (opt-in)**: integration tests
  - SQLite integration tests: set `RUN_SQLITE_INTEGRATION_TESTS=1`
  - DB connection pool tests: set `RUN_DB_INTEGRATION_TESTS=1`
  - Postgres smoke: set `RUN_POSTGRES_SMOKE_TESTS=1` and `TEST_DATABASE_URL=...`

#### Harness / manual scripts (not CI)

The repo also contains **harness/manual** test scripts used for operator-style checks and “real world” validation.

- These are **not** run by Jest or CI, and they may call `process.exit()` or hit real endpoints.
- Current locations:
  - `tests/lib/test-*.js` (script-style checks; explicitly excluded from Jest discovery)
  - `tests/*.ps1` (PowerShell harness scripts)
  - other one-off harness scripts under `tests/`

Examples:

```bash
# run Tier 2 only
npm run test:integration-lite

# run integration suite (Tier 3) locally when you have the environment
RUN_SQLITE_INTEGRATION_TESTS=1 RUN_DB_INTEGRATION_TESTS=1 npm test -- tests/integration

# run Postgres connectivity smoke
RUN_POSTGRES_SMOKE_TESTS=1 TEST_DATABASE_URL=postgresql://... npm test -- tests/integration/postgres-url-smoke.test.js
```

---

## Verify production

1. **Health check** – confirms the app is up and which commit is deployed:
   ```bash
   curl https://YOUR-APP.onrender.com/health
   ```
   Or in a browser: `https://YOUR-APP.onrender.com/health`

   The JSON response includes:
   - `status`: healthy / degraded / critical
   - `commit`: Git commit ID (set by Render; use this to confirm the deployed version)
   - `uptime`, `timestamp`, etc.

2. **Quick health (load balancer):**
   ```bash
   curl https://YOUR-APP.onrender.com/healthz
   ```

3. **Tenant query performance** (optional, from your machine with prod `DATABASE_URL` in `.env`):
   ```bash
   node scripts/test-tenant-query-perf.js
   ```

---

## Reducing alert email noise

To stop non-critical alert emails (e.g. during maintenance or when the system is idle):

- Set **one** of:
  - `ALERTS_SUPPRESSED=true`
  - `MAINTENANCE_MODE=true`
- Critical alerts will still be **logged** to the console; only email (and optional Slack) is skipped.
- Remove the variable or set to `false` when you want alerts again.

---

## Troubleshooting

| Issue | Check |
|-------|--------|
| Server won’t start | `DATABASE_URL` set? Run `node run-migration.js` and fix any errors. |
| Migrations fail | Ensure DB is reachable and `db.js` init runs (migrations need Postgres). |
| “Active Clients: 0” in backup emails | Backup logic uses `is_enabled` on tenants; ensure clients exist and are enabled. |
| Slow tenant query alerts | Index `idx_tenants_created_at` should exist; run `node run-migration.js` if needed. |
