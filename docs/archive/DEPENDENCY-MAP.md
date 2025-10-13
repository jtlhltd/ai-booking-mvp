# 🔍 COMPLETE DEPENDENCY MAP

**Last Updated:** October 13, 2025  
**Purpose:** Understand what files are ACTUALLY used in production

---

## ✅ CRITICAL FILES - DO NOT TOUCH

### Core Application Files:
```
server.js                    ✅ CRITICAL - Main application
db.js                        ✅ CRITICAL - Database operations
package.json                 ✅ CRITICAL - Dependencies & scripts
.env                         ✅ CRITICAL - Environment config (local)
.env.example                 ✅ CRITICAL - Template for setup
.gitignore                   ✅ CRITICAL - Git rules
.nvmrc, .npmrc, .node-version ✅ CRITICAL - Node config
render.yaml                  ✅ CRITICAL - Render deployment
Dockerfile                   ✅ CRITICAL - Docker config
```

---

## ✅ CORE IMPORTS - ACTIVELY USED IN server.js

### Root-Level Imports (Used in Production):
```javascript
enhanced-business-search.js   ✅ USED - Line 59: generateUKBusinesses, getIndustryCategories
real-uk-business-search.js    ✅ USED - Line 60: RealUKBusinessSearch
booking-system.js             ✅ USED - Line 61: BookingSystem
sms-email-pipeline.js         ✅ USED - Line 62: SMSEmailPipeline
gcal.js                       ✅ USED - Line 74: makeJwtAuth, insertEvent, freeBusy
```

### /lib Imports (Used in Production):
```javascript
lib/performance-monitor.js    ✅ USED - Line 71: performanceMiddleware
lib/cache.js                  ✅ USED - Line 72: cacheMiddleware, getCache
```

### /routes Imports (Used in Production):
```javascript
routes/leads.js               ✅ USED - Line 89: leadsRouter
routes/twilio-webhooks.js     ✅ USED - Line 90: twilioWebhooks
routes/vapi-webhooks.js       ✅ USED - Line 91: vapiWebhooks
```

---

## ✅ PUBLIC FILES - ACTIVELY SERVED

### HTML Files Actually Served by server.js:
```
public/index.html                        ✅ SERVED - Line 167 (/)
public/tenant-dashboard.html             ✅ SERVED - Line 171 (/tenant-dashboard)
public/client-dashboard.html             ✅ SERVED - Line 175 (/client-dashboard)
public/client-setup.html                 ✅ SERVED - Line 179 (/client-setup)
public/client-dashboard-template.html    ✅ SERVED - Line 183 (/client-template)
public/client-setup-guide.html           ✅ SERVED - Line 187 (/setup-guide)
public/onboarding-dashboard.html         ✅ SERVED - Line 191 (/onboarding)
public/onboarding-templates.html         ✅ SERVED - Line 195 (/onboarding-templates)
public/client-onboarding-wizard.html     ✅ SERVED - Line 199 (/onboarding-wizard)
public/uk-business-search.html           ✅ SERVED - Line 203 (/uk-business-search)
public/cold-call-dashboard.html          ✅ SERVED - Line 208 (/cold-call-dashboard)
public/vapi-test-dashboard.html          ✅ SERVED - Line 213 (/vapi-test-dashboard)
public/dashboard-v2.html                 ✅ SERVED - Line 11031 (/dashboard/:clientKey)
public/lead-import.html                  ✅ SERVED - Line 11036 (/lead-import.html)
public/leads.html                        ✅ SERVED - Line 11041 (/leads)
public/settings.html                     ✅ SERVED - Line 11113 (/settings/:clientKey)
public/privacy.html                      ✅ SERVED - Line 11118 (/privacy.html, /privacy)
public/zapier-docs.html                  ✅ SERVED - Line 11127 (/zapier-docs.html, /zapier)
public/manifest.json                     ✅ SERVED - PWA manifest
public/sw.js                             ✅ SERVED - Service worker
```

### Public Files NOT Explicitly Served (but may be linked):
```
public/admin-call-monitor.html           ⚠️  MAYBE - Not in server.js routes
public/booking-dashboard.html            ⚠️  MAYBE - Not in server.js routes
public/booking-simple.html               ⚠️  MAYBE - Not in server.js routes
public/client-acquisition-dashboard.html ⚠️  MAYBE - Not in server.js routes
public/dashboard.html                    ⚠️  MAYBE - Superseded by dashboard-v2.html?
public/decision-maker-finder.html        ⚠️  MAYBE - Not in server.js routes
public/email-campaign.html               ⚠️  MAYBE - Not in server.js routes
public/landing-page.html                 ⚠️  MAYBE - Not in server.js routes
public/lead-finder.html                  ⚠️  MAYBE - Not in server.js routes
public/lead-generator.html               ⚠️  MAYBE - Not in server.js routes
public/lead-input-dashboard.html         ⚠️  MAYBE - Not in server.js routes
public/lead-sourcing-tool.html           ⚠️  MAYBE - Not in server.js routes
public/lead-tracking-dashboard-old.html  ❌ SAFE - Has "old" in name
public/lead-tracking-dashboard.html      ⚠️  MAYBE - Not in server.js routes
public/sales-landing.html                ⚠️  MAYBE - Not in server.js routes
public/sales-tracker.html                ⚠️  MAYBE - Not in server.js routes
public/signup.html                       ⚠️  MAYBE - Not in server.js routes
public/simple-dashboard.html             ⚠️  MAYBE - Not in server.js routes
public/sms-pipeline-dashboard.html       ⚠️  MAYBE - Not in server.js routes
public/test-api.html                     ❌ SAFE - Test file
public/test-dashboard.html               ❌ SAFE - Test file
```

---

## ✅ /lib DIRECTORY - ALL FILES

### Files We Know Are Used:
```
lib/performance-monitor.js    ✅ USED - Imported in server.js
lib/cache.js                  ✅ USED - Imported in server.js
```

### Files That Likely Are Used (need to check):
```
lib/ab-testing.js             ⚠️  CHECK - Might be used in routes
lib/ai-insights.js            ⚠️  CHECK - Might be used in routes
lib/analytics-tracker.js      ⚠️  CHECK - Might be used in routes
lib/appointment-reminders.js  ⚠️  CHECK - Might be used in routes
lib/auto-onboarding.js        ⚠️  CHECK - Might be used for client creation
lib/booking.js                ⚠️  CHECK - Might be used in routes
lib/call-quality-analysis.js  ⚠️  CHECK - Might be used in routes
lib/client-onboarding.js      ⚠️  CHECK - Might be used in routes
lib/database-health.js        ⚠️  CHECK - Might be used in routes
lib/email-alerts.js           ⚠️  CHECK - Might be used in routes
lib/env-validator.js          ⚠️  CHECK - Might be used on startup
lib/error-monitoring.js       ⚠️  CHECK - Might be used in routes
lib/follow-up-processor.js    ⚠️  CHECK - Might be used in routes
lib/follow-up-sequences.js    ⚠️  CHECK - Might be used in routes
lib/industry-benchmarks.js    ⚠️  CHECK - Might be used in routes
lib/industry-templates.js     ⚠️  CHECK - Used by auto-onboarding
lib/instant-calling.js        ⚠️  CHECK - Might be used in routes
lib/lead-deduplication.js     ⚠️  CHECK - Might be used in routes
lib/lead-import.js            ⚠️  CHECK - Might be used in routes
lib/lead-intelligence.js      ⚠️  CHECK - Might be used in routes
lib/leads.js                  ⚠️  CHECK - Might be used in routes
lib/logger.js                 ⚠️  CHECK - Might be used everywhere
lib/messaging-service.js      ⚠️  CHECK - Might be used in routes
lib/migration-runner.js       ⚠️  CHECK - Used by run-migration.js
lib/notifications.js          ⚠️  CHECK - Might be used in routes
lib/notify.js                 ⚠️  CHECK - Might be used in routes
lib/phone-validation.js       ⚠️  CHECK - Might be used in routes
lib/quality-monitoring.js     ⚠️  CHECK - Might be used in routes
lib/realtime-events.js        ⚠️  CHECK - Might be used in routes
lib/reviews-analysis.js       ⚠️  CHECK - Might be used in routes
lib/roi-calculator.js         ⚠️  CHECK - Might be used in routes
lib/security.js               ⚠️  CHECK - Might be used in routes
lib/slots.js                  ⚠️  CHECK - Might be used in routes
lib/vapi.js                   ⚠️  CHECK - Might be used in routes
lib/white-label.js            ⚠️  CHECK - Might be used in routes
lib/workflow.js               ⚠️  CHECK - Might be used in routes
```

---

## ❌ ROOT-LEVEL FILES - LIKELY UNUSED

### Analysis/Documentation (SAFE TO ARCHIVE):
```
BUSINESS-MODEL.md                         ❌ ARCHIVE - Business docs
case-studies.md                           ❌ ARCHIVE - Marketing
CONVERSION-RATE-ANALYSIS.md               ❌ ARCHIVE - Analysis
CORE-SYSTEM-AUDIT.md                      ❌ ARCHIVE - Analysis
demo-video-script.md                      ❌ ARCHIVE - Marketing
EXHAUSTIVE-SYSTEM-ANALYSIS.md             ❌ ARCHIVE - Analysis
FINAL-SYSTEM-STATUS.md                    ❌ ARCHIVE - Analysis
FULL-SYSTEM-ANALYSIS.md                   ❌ ARCHIVE - Analysis
IMPLEMENTATION-COMPLETE.md                ❌ ARCHIVE - Analysis
IMPROVEMENTS-SUMMARY.md                   ❌ ARCHIVE - Analysis
INTEGRATION-FIXES-SUMMARY.md              ❌ ARCHIVE - Analysis
improvement-plan.md                       ❌ ARCHIVE - Analysis
marketing-campaign-strategy.md            ❌ ARCHIVE - Marketing
SALES-MATERIALS.md                        ❌ ARCHIVE - Marketing
SERVICE-IMPROVEMENTS-IMPLEMENTED.md       ❌ ARCHIVE - Analysis
SERVICE-QUALITY-COMPLETE.md               ❌ ARCHIVE - Analysis
SYSTEM-IMPROVEMENTS-IMPLEMENTED.md        ❌ ARCHIVE - Analysis
TEST_RESULTS_SUMMARY.md                   ❌ ARCHIVE - Testing
TEST_SUITE_README.md                      ❌ ARCHIVE - Testing
THEORETICAL-IMPROVEMENTS.md               ❌ ARCHIVE - Analysis
DISASTER-RECOVERY-RUNBOOK.md              ❌ ARCHIVE - Ops docs
DEPLOYMENT-SUCCESS.md                     ❌ ARCHIVE - Deployment docs
GOOGLE_CALENDAR_DELEGATION_SETUP.md       ❌ ARCHIVE - Setup docs
REAL_DATA_API_SETUP.md                    ❌ ARCHIVE - Setup docs
REAL_DATA_SETUP.md                        ❌ ARCHIVE - Setup docs
CLIENT_DASHBOARD_README.md                ❌ ARCHIVE - Docs
QUICK-START-DEMO.md                       ❌ ARCHIVE - Docs
API_SETUP_GUIDE.md                        ❌ ARCHIVE - Docs
AUTOMATED-ONBOARDING.md                   ❌ ARCHIVE - Docs
CURSOR_CONTEXT.md                         ❌ ARCHIVE - AI context
CHANGELOG.md                              ❌ ARCHIVE - Not maintained
VERIFICATION-GUIDE.md                     ❌ ARCHIVE - Setup docs
HOW_TO_PATCH.txt                          ❌ ARCHIVE - Old notes
```

### Old Vapi Scripts (SAFE TO ARCHIVE - Keep only VAPI-FINAL-OPTIMIZED.txt):
```
assistant-british-optimized.json          ❌ ARCHIVE - Old script
assistant-optimized-cold-call-bot.json    ❌ ARCHIVE - Old script
assistant-version-17282d82-2025-09-25.json ❌ ARCHIVE - Old script
VAPI-ASSISTANT-CURRENT-SETUP.md           ❌ ARCHIVE - Old docs
VAPI-DAILY-TESTING-CARD.md                ❌ ARCHIVE - Old docs
VAPI-FREE-TESTING-GUIDE.md                ❌ ARCHIVE - Old docs
VAPI-IMPROVEMENT-FLOW.md                  ❌ ARCHIVE - Old docs
VAPI-MASTERY-GUIDE.md                     ❌ ARCHIVE - Old docs
VAPI-OPTIMIZED-CONFIG.json                ❌ ARCHIVE - Old config
VAPI-OPTIMIZED-SCRIPT-v2.md               ❌ ARCHIVE - Old script
VAPI-PASTE-READY.txt                      ❌ DUPLICATE - Same as FINAL
VAPI-SILENT-OPTIMIZATION.md               ❌ ARCHIVE - Old docs
vapi-sms-pipeline-script.md               ❌ ARCHIVE - Old script
VAPI-TEST-TRACKER.md                      ❌ ARCHIVE - Old docs
VAPI-TESTING-PLAN.md                      ❌ ARCHIVE - Old docs
VAPI-TESTING-SCENARIOS.md                 ❌ ARCHIVE - Old docs
VAPI-TOOLS-SETUP.md                       ❌ ARCHIVE - Old docs
VAPI-WHAT-TO-TEST-GUIDE.md                ❌ ARCHIVE - Old docs
enhanced-vapi-prompts.js                  ❌ ARCHIVE - Old script
```

### Test Scripts (SAFE TO DELETE):
```
final-system-test.ps1                     ❌ DELETE - Old test
onboard-victory-dental.ps1                ❌ DELETE - Demo script
quick-test.ps1                            ❌ DELETE - Old test
run-all-tests.ps1                         ❌ DELETE - Old test
run-simple-tests.ps1                      ❌ DELETE - Old test
run-smoke.bat                             ❌ DELETE - Old test
smoke.ps1                                 ❌ DELETE - Old test
setup-vapi-victory-dental.ps1             ❌ DELETE - Demo script
```

### Temporary/One-Time Files (SAFE TO DELETE):
```
server_temp.js                            ❌ DELETE - Temp backup
current_changes.txt                       ❌ DELETE - Empty file
tatus                                     ❌ DELETE - Typo/temp
git                                       ❌ DELETE - Old notes
push-fix.bat                              ❌ DELETE - One-time fix
fix-tenants.js                            ❌ DELETE - One-time fix
fix-tenants-remote.js                     ❌ DELETE - One-time fix
setup-my-client.js                        ❌ DELETE - Demo script
create-demo-client.sql                    ❌ DELETE - Demo script
fix-render-db.sql                         ❌ DELETE - One-time fix
QUICK-FIX.sql                             ❌ DELETE - One-time fix
run-migration.js                          ⚠️  KEEP - Used in render-start script
```

### Unused Feature Files (NEED TO VERIFY):
```
advanced-contact-research.js              ⚠️  CHECK - Grep server.js for imports
advanced-lead-scoring.js                  ⚠️  CHECK - Grep server.js for imports
bulk-lead-import.js                       ⚠️  CHECK - Grep server.js for imports
decision-maker-contact-finder.js          ⚠️  CHECK - Grep server.js for imports
decision-maker-identification.js          ⚠️  CHECK - Grep server.js for imports
simple-decision-maker-contact-finder.js   ⚠️  CHECK - Grep server.js for imports
real-decision-maker-contact-finder.js     ⚠️  CHECK - 118KB! Grep for imports
enhanced-decision-maker-contact-finder.js ⚠️  CHECK - Grep for imports
enhanced-uk-business-search.js            ✅ USED - Imported in server.js
intelligent-analytics.js                  ⚠️  CHECK - Might be in /lib instead
industry-templates.js                     ⚠️  CHECK - Should be in /lib
jobs.js                                   ⚠️  CHECK - Grep for imports
major_cities.js                           ⚠️  CHECK - Grep for imports
outreach-automation.js                    ⚠️  CHECK - Grep for imports
partnership-framework.js                  ⚠️  CHECK - Grep for imports
real-time-notifications.js                ⚠️  CHECK - Might be in /lib instead
real-uk-business-search.js                ✅ USED - Imported in server.js
sheets.js                                 ⚠️  CHECK - Grep for imports
store.js                                  ⚠️  CHECK - Grep for imports
uk-business-api.js                        ⚠️  CHECK - Grep for imports
white-label-config.js                     ⚠️  CHECK - Might be in /lib instead
```

---

## 🎯 NEXT STEPS

### Phase 1: Check Remaining Uncertain Files
Run grep on server.js to see if these files are imported anywhere:
- advanced-contact-research.js
- advanced-lead-scoring.js
- bulk-lead-import.js
- decision-maker-*.js files
- intelligent-analytics.js
- industry-templates.js (root vs /lib)
- jobs.js
- sheets.js
- store.js
- uk-business-api.js
- white-label-config.js

### Phase 2: Check /lib Usage
Grep all /lib files to see which are imported in routes/* or server.js

### Phase 3: Safe Archiving
Create archive/ directory and move (NOT delete) files marked ❌ ARCHIVE

### Phase 4: Safe Deletion
Delete files marked ❌ DELETE (tests, temp files, duplicates)

### Phase 5: Test Everything
After each phase:
1. Start server: `npm start`
2. Test health: `curl http://localhost:3000/health`
3. Test dashboard: Visit dashboard URL
4. Test lead import
5. Commit if all good

---

**DO NOT PROCEED WITHOUT USER APPROVAL**

