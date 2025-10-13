# 🧹 PROJECT CLEANUP PLAN

## CURRENT PROBLEM:
- **109 files in root directory** (should be ~15)
- Multiple duplicate/outdated files
- Confusion about what does what
- Hard to navigate and understand

---

## ✅ WHAT TO KEEP (ESSENTIAL FILES)

### 🔧 **Core System Files (KEEP)**
```
server.js                    # Main application server
db.js                        # Database connection & queries
package.json                 # Dependencies
.env                         # Environment variables (local only)
.env.example                 # Template for .env
render.yaml                  # Render deployment config
Dockerfile                   # Docker config (for Render)
.gitignore                   # Git ignore rules
.nvmrc                       # Node version
.npmrc                       # NPM config
.node-version                # Node version
```

### 📁 **Core Directories (KEEP)**
```
/lib                         # Core libraries (AI, security, cache, etc.)
/migrations                  # Database migrations
/public                      # Client-facing pages (dashboard, leads, etc.)
/routes                      # API routes
/middleware                  # Express middleware
/node_modules                # Dependencies (auto-generated)
```

### 📖 **Essential Documentation (KEEP - ORGANIZE)**
```
README.md                    # Main project overview
DEPLOYMENT-GUIDE.md          # How to deploy
CLIENT-ONBOARDING-GUIDE.md   # How to onboard clients
VAPI-FINAL-OPTIMIZED.txt     # Latest Vapi script (ONLY THIS ONE)
```

---

## 🗑️ WHAT TO DELETE/ARCHIVE

### ❌ **DELETE - Outdated Vapi Scripts (Keep only VAPI-FINAL-OPTIMIZED.txt)**
```
assistant-british-optimized.json                  # OLD
assistant-optimized-cold-call-bot.json            # OLD
assistant-version-17282d82-2025-09-25.json        # OLD
VAPI-ASSISTANT-CURRENT-SETUP.md                   # OLD
VAPI-DAILY-TESTING-CARD.md                        # OLD
VAPI-FREE-TESTING-GUIDE.md                        # OLD
VAPI-IMPROVEMENT-FLOW.md                          # OLD
VAPI-MASTERY-GUIDE.md                             # OLD
VAPI-OPTIMIZED-CONFIG.json                        # OLD
VAPI-OPTIMIZED-SCRIPT-v2.md                       # OLD
VAPI-PASTE-READY.txt                              # DUPLICATE (same as FINAL)
VAPI-SILENT-OPTIMIZATION.md                       # OLD
vapi-sms-pipeline-script.md                       # OLD
VAPI-TEST-TRACKER.md                              # OLD
VAPI-TESTING-PLAN.md                              # OLD
VAPI-TESTING-SCENARIOS.md                         # OLD
VAPI-TOOLS-SETUP.md                               # OLD
VAPI-WHAT-TO-TEST-GUIDE.md                        # OLD
enhanced-vapi-prompts.js                          # OLD
```

### ❌ **DELETE - Test Scripts (No Longer Needed)**
```
final-system-test.ps1
onboard-victory-dental.ps1
quick-test.ps1
run-all-tests.ps1
run-simple-tests.ps1
run-smoke.bat
smoke.ps1
setup-vapi-victory-dental.ps1
```

### ❌ **DELETE - Temporary/Unused Files**
```
server_temp.js               # Temporary backup
current_changes.txt          # Empty file
tatus                        # Typo/temp file
git                          # Old git notes?
push-fix.bat                 # One-time fix
fix-tenants.js               # One-time fix
fix-tenants-remote.js        # One-time fix
setup-my-client.js           # One-time demo script
create-demo-client.sql       # One-time demo script
fix-render-db.sql            # One-time fix
QUICK-FIX.sql                # One-time fix
run-migration.js             # Not needed (migrations auto-run)
```

### ❌ **DELETE - Duplicate/Outdated Docs**
```
README (1).md                # Duplicate
AUTOMATED-ONBOARDING.md      # Covered in CLIENT-ONBOARDING-GUIDE.md
API_SETUP_GUIDE.md           # Covered in DEPLOYMENT-GUIDE.md
CHANGELOG.md                 # Not maintained
CURSOR_CONTEXT.md            # Internal AI context (not user-facing)
HOW_TO_PATCH.txt             # Outdated
VERIFICATION-GUIDE.md        # One-time setup
```

### 📦 **ARCHIVE - Analysis/Historical Docs (Move to /docs/archive/)**
```
BUSINESS-MODEL.md
case-studies.md
CONVERSION-RATE-ANALYSIS.md
CORE-SYSTEM-AUDIT.md
demo-video-script.md
EXHAUSTIVE-SYSTEM-ANALYSIS.md
FINAL-SYSTEM-STATUS.md
FULL-SYSTEM-ANALYSIS.md
IMPLEMENTATION-COMPLETE.md
IMPROVEMENTS-SUMMARY.md
INTEGRATION-FIXES-SUMMARY.md
improvement-plan.md
marketing-campaign-strategy.md
SALES-MATERIALS.md
SERVICE-IMPROVEMENTS-IMPLEMENTED.md
SERVICE-QUALITY-COMPLETE.md
SYSTEM-IMPROVEMENTS-IMPLEMENTED.md
TEST_RESULTS_SUMMARY.md
TEST_SUITE_README.md
THEORETICAL-IMPROVEMENTS.md
DISASTER-RECOVERY-RUNBOOK.md
DEPLOYMENT-SUCCESS.md
GOOGLE_CALENDAR_DELEGATION_SETUP.md
REAL_DATA_API_SETUP.md
REAL_DATA_SETUP.md
CLIENT_DASHBOARD_README.md
QUICK-START-DEMO.md
```

### ❓ **REVIEW - Unused Feature Files (Likely Delete)**
```
advanced-contact-research.js              # Not used in production
advanced-lead-scoring.js                  # Not used in production
booking-system.js                         # Might be legacy
bulk-lead-import.js                       # Might be legacy
client-acquisition-dashboard.html         # Not linked/used?
client-acquisition-materials.md           # Marketing materials?
create-client-dashboard.js                # One-time script?
decision-maker-contact-finder.js          # Not used?
decision-maker-identification.js          # Not used?
email-campaign.html                       # Not used?
enhanced-business-search.js               # Not used?
enhanced-decision-maker-contact-finder.js # Not used?
enhanced-uk-business-search.js            # Not used?
gcal.js                                   # Still used?
industry-templates.js                     # Should be in /lib
intelligent-analytics.js                  # Should be in /lib
jobs.js                                   # Still used?
landing-page.html                         # Not linked/used?
lead-generator.html                       # Not linked/used?
major_cities.js                           # Not used?
outreach-automation.js                    # Not used?
partnership-framework.js                  # Not used?
real-decision-maker-contact-finder.js     # 118KB file - not used?
real-time-notifications.js                # Should be in /lib?
real-uk-business-search.js                # Not used?
sales-tracker.html                        # Not used?
sheets.js                                 # Still used?
simple-decision-maker-contact-finder.js   # Not used?
sms-email-pipeline.js                     # Should be in /lib?
store.js                                  # Still used?
test-api.html                             # Test page - delete?
uk-business-api.js                        # Not used?
white-label-config.js                     # Should be in /lib?
```

---

## 🎯 FINAL CLEAN STRUCTURE

### Root Directory (15 core files):
```
/ai-booking-mvp-skeleton-v2/
  server.js
  db.js
  package.json
  .env
  .env.example
  .gitignore
  .nvmrc
  .npmrc
  .node-version
  Dockerfile
  render.yaml
  README.md
  DEPLOYMENT-GUIDE.md
  CLIENT-ONBOARDING-GUIDE.md
  VAPI-FINAL-SCRIPT.txt
  
  /lib/                      # Core utilities
  /migrations/               # Database migrations
  /public/                   # Client UI
  /routes/                   # API routes
  /middleware/               # Express middleware
  /docs/                     # All documentation (organized)
  /archive/                  # Historical files
  /node_modules/             # Dependencies
```

### Documentation Structure:
```
/docs/
  /archive/                  # All historical analysis docs
  /guides/                   # User guides (deployment, onboarding, etc.)
  /vapi/                     # Vapi script history (if needed)
  /business/                 # Business docs (sales, marketing, case studies)
```

---

## 🚀 EXECUTION PLAN

### Step 1: Create Archive Directory
```bash
mkdir -p docs/archive
mkdir -p docs/guides
mkdir -p docs/business
```

### Step 2: Move Files
- Move all analysis docs → `/docs/archive/`
- Move business/sales docs → `/docs/business/`
- Move guides → `/docs/guides/`

### Step 3: Delete Unnecessary Files
- Delete all old Vapi scripts (keep only VAPI-FINAL-OPTIMIZED.txt)
- Delete all test scripts
- Delete all temp/one-time files
- Delete unused feature files

### Step 4: Review Potentially Unused Files
- Check if gcal.js, sheets.js, store.js, jobs.js are still used
- Move industry-templates.js → /lib/ (if used)
- Move white-label-config.js → /lib/ (if used)

### Step 5: Update README.md
Create a clear, single-page README with:
- What this project is
- How to deploy it
- Where to find docs
- Quick start guide

---

## ✅ BENEFITS AFTER CLEANUP

1. **15 root files instead of 109** (86% reduction)
2. **Clear purpose for every file**
3. **Easy to navigate**
4. **Easier to onboard developers**
5. **No more confusion**
6. **Historical docs preserved in /docs/archive/**

---

## 🎯 NEXT STEPS

1. Review this plan
2. Approve deletion/archiving
3. Run automated cleanup script
4. Test that system still works
5. Commit cleaned-up repo

**Want me to execute this cleanup now?**

