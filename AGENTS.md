# AGENTS.md

Guidance for cloud agents working in this repository.

## Cursor Cloud specific instructions

### Product

Single **Node.js monolith** (`ai-booking-mvp`): Express API + Socket.IO + in-process cron workers, with a **Vite MPA** in `frontend/` (built to `public/build/`). See `README.md` and `docs/HOW-TO-RUN.md`.

### Dependencies

- **Package manager:** npm (`package-lock.json`). Use `npm ci` on a clean VM.
- **Node:** `.nvmrc` pins **20.16.0** (matches GitHub Actions). Node 22 often works but prefer 20 for parity with CI/native addons.

### Local `.env` (not committed)

Copy `.env.example` → `.env` and set at minimum:

| Variable | Local dev value |
|----------|-----------------|
| `DATABASE_URL` | Any non-empty string (required by `lib/env-validator.js`) |
| `API_KEY` | Secret string for admin routes (`x-api-key` header) |
| `PORT` | `3000` (optional; default in code is 10000 if unset) |

**SQLite (default):** Leave `DB_TYPE` unset or not `postgres`. DB file: `data/app.db` (created on first `npm start`). No Postgres container required for basic API/UI dev.

**Postgres:** Set `DB_TYPE=postgres` and a real `DATABASE_URL`, then `npm run migrate` before start.

Optional integrations (Vapi, Twilio, Google Calendar) are warned, not required, for boot. Run `node scripts/check-setup.js` to see what's missing.

### Commands

| Task | Command |
|------|---------|
| Install | `npm ci` |
| Frontend build | `npm run build` (required for Vite dashboards under `/build/pages/...` and `/client-dashboard`) |
| Run server | `npm start` or `npm run dev` |
| Policy gate | `npm run check:policy` |
| Full CI suite | `npm run test:ci` (policy + inventories + unit + integration-lite + coverage + leak detection). Set `TZ=UTC` for deterministic date tests. |
| Unit only | `npm run test:unit` |
| Route/DB contracts | `npm run test:integration-lite` |

There is **no ESLint script**; static behavioral policy is `npm run check:policy`.

### Health / smoke

- `GET /health`, `GET /healthz`, `GET /health/quick`
- Admin API: `GET /admin/clients` with header `x-api-key: <API_KEY>`
- Built UI: `http://localhost:3000/client-dashboard` (after `npm run build`)

### Gotchas

- **Do not** run `npm run migrate` for SQLite-only local dev; `run-migration.js` expects Postgres.
- Some dashboard SQL paths use Postgres syntax (`ON CONFLICT`, etc.) and may error on SQLite; use Postgres for full dashboard/API parity.
- `setup.sh` runs migrate + starts server — skip migrate when using SQLite-only.
- Stop dev servers on port 3000 when done (`lsof -ti:3000 | xargs kill` if needed).
- Vapi/Twilio webhooks need a public `BASE_URL`; not required for local health/UI checks.
