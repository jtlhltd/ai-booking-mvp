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

---

## Deploy to Render

1. Connect the GitHub repo to Render (Web Service).
2. **Build command:** leave default or `echo "no build step"`.
3. **Start command:** `npm run render-start` (runs migrations then `node server.js`).
4. In Render **Environment** tab, add all required variables (see above). Include `DATABASE_URL` from the Render Postgres instance if using it.
5. Deploy. Render will set `RENDER_GIT_COMMIT` to the deployed commit.

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
