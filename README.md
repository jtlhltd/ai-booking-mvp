# AI Booking MVP

An intelligent booking system with lead qualification, calendar integration, and automated outreach.

## 🚀 Live Service

**Production URL**: https://ai-booking-mvp.onrender.com

## 📁 Project Structure

```
ai-booking-mvp/
├── src/                    # Core application files
│   ├── server.js          # Main Express server
│   ├── db.js              # Database layer
│   ├── gcal.js            # Google Calendar integration
│   └── ...                # Other modules
├── public/                # Static HTML files & dashboards
├── tests/                 # Test suites & validation
├── scripts/               # Utility scripts & automation
├── docs/                  # Documentation
├── mcp/                   # MCP integration files
├── package.json
└── README.md
```

## 🛠️ Quick Start

### Local Development
```bash
npm install
npm start
```

### Testing
```bash
# Run specific test suites
./tests/test-simple.ps1
./tests/test-complete-system.ps1
```

### Deployment
```bash
# Push changes to auto-deploy
git add .
git commit -m "Your changes"
git push
```

## 🔧 Environment Variables

See `docs/API_SETUP_GUIDE.md` for complete environment configuration.

## 📚 Documentation

- **API Setup**: `docs/API_SETUP_GUIDE.md`
- **Test Suite**: `docs/TEST_SUITE_README.md`
- **Client Dashboard**: `docs/CLIENT_DASHBOARD_README.md`

## 🤖 MCP Integration

MCP (Model Context Protocol) integration for Render deployment management:

```bash
# MCP tools available for:
# - Deployment monitoring
# - Log viewing
# - Service management
```

## 🔄 Git Workflow

Use the helper scripts for easy syncing:

```bash
# Pull latest changes
./scripts/pull-changes.ps1

# Push changes
./scripts/push-changes.ps1 "Your commit message"
```

## 📊 Monitoring

- **Render Dashboard**: https://dashboard.render.com
- **Service Health**: https://ai-booking-mvp.onrender.com/health
- **API Status**: https://ai-booking-mvp.onrender.com/admin/system-health

---

**Built with**: Node.js, Express, SQLite/Postgres, Google Calendar API, Twilio, VAPI
