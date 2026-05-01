# 🤖 AI Booking MVP - Automated Appointment Booking System

**Production-ready SaaS platform for AI-powered appointment booking via phone calls**

---

## 🎯 What This Does

Automatically book appointments for your clients using AI voice assistants that:
- Answer phone calls 24/7 (even after hours)
- Qualify leads and schedule appointments
- Send SMS confirmations and reminders
- Integrate with Google Calendar
- Handle objections and follow-ups

Perfect for: Dental clinics, beauty salons, fitness studios, home services, medical practices, and any business that books appointments.

---

## 🚀 Quick Start

### 1. **Environment Setup**
```bash
cp .env.example .env
# Edit .env with your credentials (Vapi, Twilio, Google Calendar, Database)
```

### 2. **Install & Run**
```bash
npm install
npm start
```

Server runs on `http://localhost:3000`

### 3. **Deploy to Render**
- Connect your GitHub repo to Render
- Render will use `render.yaml` for automatic deployment (`npm run render-start` runs DB migrations then the server)
- Set environment variables in Render dashboard
- GitHub Actions runs `npm test` on pushes/PRs to `main` (see **Actions** tab)

---

## 📁 Project Structure

```
/ai-booking-mvp-skeleton-v2/
│
├── server.js                    # Main HTTP server (Express + inline + mounted routers)
├── db.js                        # DB layer (Postgres + SQLite fallback). Cohesive
│                                # query clusters live in /db/* siblings; db.js
│                                # re-exports thin wrappers for back-compat.
├── package.json                 # Dependencies
│
├── /lib/                        # Core utilities + extracted helpers
│   ├── instant-calling.js                # In-memory burst dialer (dialLeadsNowBatch).
│   │                                     # NOT the cron worker; that one lives in server.js.
│   ├── dashboard-activity-formatters.js  # Pure formatters extracted from server.js (PR-10)
│   ├── bootstrap-clients.js              # BOOTSTRAP_CLIENTS_JSON seed logic (PR-10)
│   ├── log-scrubber.js                   # PII redaction for production logs (PR-6)
│   ├── ops-invariants.js                 # Periodic runtime invariant checks
│   ├── scheduled-jobs.js                 # Cron + setInterval registration
│   ├── vapi.js                           # Vapi AI integration
│   ├── auto-onboarding.js                # Client self-service signup
│   ├── security.js                       # Encryption, GDPR, 2FA
│   ├── white-label.js                    # Client branding
│   └── ... (many more utility modules)
│
├── /db/                         # SQL clusters extracted from db.js (PR-11)
│   ├── cost-budget-tracking.js           # Cost tracking, budget limits, cost alerts
│   └── analytics-events.js               # Analytics events, conversion stages + funnel
│
├── /routes/                     # Express routers mounted from server.js
│   ├── leads.js                          # Lead CRUD operations
│   ├── vapi-webhooks.js                  # Vapi call webhooks (verifyVapiSignature gate)
│   ├── clients-api.js                    # Tenant-scoped client API (authenticateApiKey gate)
│   ├── tools-mount.js                    # Vapi tool endpoints
│   ├── twilio-webhooks.js                # SMS webhooks
│   └── ... (many more routers)
│
├── /public/                     # Client-facing pages (landing, dashboards, wizards)
│
├── /migrations/                 # SQL migrations (auto-run on deploy)
│
├── /scripts/                    # Operational + CI scripts
│   └── check-policy.mjs                  # Static policy gate (forbidden import patterns)
│
├── /tests/                      # Jest tests
│   ├── /canaries/                        # Behavioural regression catchers
│   ├── /db/                              # DB contract tests (sibling modules)
│   ├── /unit/                            # Pure unit tests
│   ├── /lib/                             # Tests scoped to /lib modules
│   ├── /routes/                          # Route-level tests
│   ├── /manual/                          # PowerShell / .bat smoke scripts (PR-2)
│   └── /fixtures/                        # Test fixtures (HTML, JSON, etc.)
│
├── /docs/                       # Documentation
│   ├── HYGIENE.md                        # Codebase hygiene burndown summary (PR-12)
│   ├── INTENT.md                         # Behavioural intent contract
│   ├── AUDIT_MAP.md                      # Entrypoints + dependencies map
│   ├── AUDIT_BACKLOG.md                  # Outstanding audit findings
│   ├── ENTRYPOINT_BURNDOWN.md            # server.js / db.js refactor roadmap
│   ├── /setup/                           # Deployment + integration setup guides
│   └── /vapi-history/                    # Old Vapi script versions
│
├── .env.example                 # Required environment variables
├── render.yaml                  # Render deployment config
└── VAPI-FINAL-OPTIMIZED.txt     # Latest Vapi AI script
```

---

## 🔑 Key Features

### ✅ **For End Clients (Your Customers)**
- 📊 Real-time dashboard (call stats, bookings, revenue)
- 📥 Lead import (CSV, Zapier, API webhooks)
- 🎨 White-label branding (logo, colors, custom domain)
- 📱 SMS & email notifications
- 📈 Analytics & ROI tracking
- 🔒 GDPR compliance (consent management, data export)

### ✅ **For You (Platform Owner)**
- 🎯 Self-service client onboarding (automated Vapi assistant creation)
- 💳 Multi-tenant architecture (unlimited clients)
- 🚀 Scalable (Redis cache, performance monitoring)
- 🔐 Secure (2FA, role-based access, audit logs)
- 📊 Admin dashboard (system health, metrics)

---

## 🛠️ Core Integrations

| Service | Purpose | Required? |
|---------|---------|-----------|
| **Vapi** | AI voice assistant for calls | ✅ Yes |
| **Twilio** | SMS notifications & voice routing | ✅ Yes |
| **Google Calendar** | Appointment scheduling | ✅ Yes |
| **PostgreSQL** | Database (managed by Render) | ✅ Yes |
| **Zapier** | Optional lead import automation | ⚠️ Optional |

---

## 📖 Essential Documentation

| File | Purpose |
|------|---------|
| **`docs/HOW-TO-RUN.md`** | **How to run: env vars, migrations, local, Render, verify production** |
| `SECURITY.md` | How to report security issues (private repo) |
| `.nvmrc` | Node 20 for local dev (recommended for Windows + native deps like `better-sqlite3`) |
| `VAPI-FINAL-OPTIMIZED.txt` | Latest AI cold calling script (paste into Vapi dashboard) |
| `.env.example` | Required environment variables |
| `docs/HYGIENE.md` | Codebase hygiene burndown summary (PR-1 → PR-12) |
| `docs/INTENT.md` | Behavioural intent contract (gates, canaries, invariants) |
| `docs/AUDIT_MAP.md` | Entrypoints, scheduled jobs, integrations, gates |
| `docs/AUDIT_BACKLOG.md` | Outstanding audit findings + status |
| `docs/setup/RENDER-DEPLOYMENT-GUIDE.md` | Full deployment instructions |
| `docs/CLIENT-ONBOARDING-GUIDE.md` | How to onboard new clients |
| `docs/API_SETUP_GUIDE.md` | API setup + integration reference |

---

## 🎤 Vapi AI Script

**Latest optimized script:** `VAPI-FINAL-OPTIMIZED.txt`

- 10/10 rated pattern interrupt opening
- Exhaustive objection handling (20+ scenarios)
- SMS-first booking flow
- Natural British voice (configurable)
- 1-2% cold call conversion rate (realistic)

**How to use:**
1. Copy contents of `VAPI-FINAL-OPTIMIZED.txt`
2. Paste into Vapi dashboard → Assistant → System Prompt
3. Configure voice (British female recommended)
4. Test with Vapi's built-in web test

---

## 🧪 Testing Endpoints

```bash
# Health check
curl http://localhost:3000/health

# Create test client
POST http://localhost:3000/api/create-client
{
  "businessName": "Test Salon",
  "industry": "beauty",
  "ownerEmail": "test@example.com",
  "ownerPhone": "+447700900000"
}

# Import test lead
POST http://localhost:3000/api/import-leads/:clientKey
{
  "leads": [
    {
      "phone": "+447700900123",
      "name": "John Doe",
      "email": "john@example.com"
    }
  ]
}
```

## 🧪 Testing (local + CI)

- **Recommended Node**: **Node 20.16.0** (see `.nvmrc` / `.node-version` / `package.json` → `volta.node`)
- **Default**: `npm test`
- **Coverage**: `npm run test:coverage`
- **Integration-lite (always runnable on Windows/Node 22 in Cursor)**: `npm run test:integration-lite` (runs `tests/routes/**` + `tests/db/**`)
- **CI-equivalent**: `npm run test:ci` (adds route inventories + runs Jest + coverage)

### Windows note (Node)

This repo depends on `better-sqlite3` (native addon). **Node 20 is recommended** (see `.nvmrc`, `.node-version`, and `package.json` → `volta.node`).

If you run tests from inside Cursor, be aware Cursor can ship its own Node runtime; if that runtime is Node 22+, it can cause `better-sqlite3` install/rebuild failures unless you also have Visual Studio C++ build tools installed. Prefer running commands in a terminal where **Node 20** is first on `PATH`.

---

## 🔐 Security & Compliance

- ✅ API key authentication
- ✅ Rate limiting (60 req/min)
- ✅ Input sanitization
- ✅ GDPR compliance (consent, right to be forgotten)
- ✅ Encrypted sensitive data (bcrypt)
- ✅ Audit logs
- ✅ 2FA support
- ✅ IP whitelisting

---

## 📊 Tech Stack

- **Backend:** Node.js 18+, Express.js
- **Database:** PostgreSQL (Render managed)
- **AI Voice:** Vapi
- **SMS:** Twilio
- **Calendar:** Google Calendar API
- **Caching:** In-memory (Redis-compatible)
- **Deployment:** Render (auto-deploy from GitHub)

---

## 🐛 Troubleshooting

### Server won't start
```bash
# Check environment variables
cat .env

# Check database connection
# Ensure DATABASE_URL is set correctly

# Check logs
npm start
```

### Database migrations failing
```bash
# Visit this endpoint to manually add missing columns
http://localhost:3000/complete-setup
```

### Vapi calls not working
- Check `VAPI_API_KEY` in `.env`
- Verify assistant ID in Vapi dashboard
- Check webhook URL is publicly accessible

---

## 📈 Performance

- **Response Time:** <100ms (cached), <500ms (uncached)
- **Uptime:** 99.9% (Render SLA)
- **Scalability:** Handles 1000+ concurrent clients
- **Call Capacity:** Unlimited (Vapi managed)

---

## 🚀 Deployment

**Render (Recommended):**
1. Push code to GitHub
2. Connect repo to Render
3. Set environment variables
4. Deploy (auto-triggered on push to main)

**Manual:**
```bash
npm install --production
npm run render-start
```

---

## 📞 Support & Docs

- **Vapi Script:** `VAPI-FINAL-OPTIMIZED.txt`
- **Deployment Guide:** `docs/setup/RENDER-DEPLOYMENT-GUIDE.md`
- **Onboarding Guide:** `docs/CLIENT-ONBOARDING-GUIDE.md`
- **API Docs:** `docs/API_SETUP_GUIDE.md`

---

## 📝 License

Private - All Rights Reserved

---

## 🎯 What's Next?

1. **Deploy to production** (Render)
2. **Update Vapi script** (`VAPI-FINAL-OPTIMIZED.txt`)
3. **Make 100 test calls** (validate conversion rate)
4. **Onboard first client** (use `/onboarding-wizard`)
5. **Scale!** 🚀

---

**Built with ❤️ for automated appointment booking**
