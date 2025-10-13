# 📁 PUBLIC HTML FILES ANALYSIS

**Total HTML files:** 39  
**Date:** October 13, 2025

---

## ✅ ACTIVELY ROUTED IN SERVER.JS (12 files)

These are explicitly served by server.js routes:

1. ✅ `index.html` - Line 167 - Homepage
2. ✅ `tenant-dashboard.html` - Line 171 - Tenant dashboard
3. ✅ `client-dashboard.html` - Line 175 - Client dashboard
4. ✅ `client-setup.html` - Line 179 - Client setup
5. ✅ `client-dashboard-template.html` - Line 183 - Template for clients
6. ✅ `client-setup-guide.html` - Line 187 - Setup guide
7. ✅ `onboarding-dashboard.html` - Line 191 - Onboarding
8. ✅ `onboarding-templates.html` - Line 195 - Onboarding templates
9. ✅ `client-onboarding-wizard.html` - Line 199 - Onboarding wizard
10. ✅ `uk-business-search.html` - Line 203 - Lead finder
11. ✅ `cold-call-dashboard.html` - Line 208 - Cold call dashboard
12. ✅ `vapi-test-dashboard.html` - Line 213 - Vapi testing

---

## ✅ SERVED VIA STATIC MIDDLEWARE (All 39 files)

All HTML files in `/public/` are accessible via `express.static('public')` on line 163.

This means users can access any HTML file by navigating to:
`https://your-app.com/filename.html`

---

## ⚠️ FILES THAT MIGHT BE OLD/UNUSED

### Old Versions:
1. ❓ `dashboard.html` - Might be superseded by `dashboard-v2.html`
2. ❓ `lead-tracking-dashboard-old.html` - Has "old" in name, likely superseded by `lead-tracking-dashboard.html`

### Test Files:
3. ❌ `test-api.html` - Test file (likely unused in production)
4. ❌ `test-dashboard.html` - Test file (likely unused in production)

### Duplicate Dashboards (Need Review):
5. ❓ `dashboard.html` vs `dashboard-v2.html` vs `simple-dashboard.html`
6. ❓ `lead-tracking-dashboard.html` vs `lead-tracking-dashboard-old.html`
7. ❓ `booking-dashboard.html` vs `booking-simple.html`

### Marketing/Unused Pages:
8. ❓ `client-acquisition-dashboard.html` - Not routed
9. ❓ `email-campaign.html` - Not routed
10. ❓ `landing-page.html` - Not routed
11. ❓ `lead-generator.html` - Not routed
12. ❓ `sales-landing.html` - Not routed
13. ❓ `sales-tracker.html` - Not routed
14. ❓ `decision-maker-finder.html` - Not routed

### Admin/Internal Tools:
15. ❓ `admin-call-monitor.html` - Admin tool (might be used)
16. ❓ `lead-import.html` - Import tool (likely used)
17. ❓ `lead-input-dashboard.html` - Lead input (likely used)

### General Pages:
18. ✅ `leads.html` - Referenced in routes/leads.js
19. ✅ `settings.html` - Standard settings page
20. ✅ `signup.html` - Standard signup page
21. ✅ `privacy.html` - Referenced in server.js line 110
22. ✅ `zapier-docs.html` - Referenced in server.js line 110

---

## 🎯 SAFE TO DELETE (5 files)

### Confirmed Old/Test Files:
1. ❌ `lead-tracking-dashboard-old.html` - Old version
2. ❌ `test-api.html` - Test file
3. ❌ `test-dashboard.html` - Test file

### Already deleted from root but exist in public:
4. ❌ `client-acquisition-dashboard.html`
5. ❌ `email-campaign.html`
6. ❌ `landing-page.html`
7. ❌ `lead-generator.html`
8. ❌ `sales-tracker.html`

**Total safe to delete:** 8 files

---

## ⚠️ NEED INVESTIGATION (6 files)

1. ❓ `dashboard.html` - Check if dashboard-v2.html replaces it
2. ❓ `simple-dashboard.html` - Check if used
3. ❓ `decision-maker-finder.html` - Check if used
4. ❓ `sales-landing.html` - Check if used
5. ❓ `lead-sourcing-tool.html` - Check if used
6. ❓ `lead-finder.html` - Check if used

---

## ✅ DEFINITELY KEEP (25 files)

1. index.html
2. tenant-dashboard.html
3. client-dashboard.html
4. client-dashboard-template.html
5. client-setup.html
6. client-setup-guide.html
7. client-onboarding-wizard.html
8. onboarding-dashboard.html
9. onboarding-templates.html
10. uk-business-search.html
11. cold-call-dashboard.html
12. vapi-test-dashboard.html
13. dashboard-v2.html
14. lead-tracking-dashboard.html
15. booking-dashboard.html
16. booking-simple.html
17. admin-call-monitor.html
18. sms-pipeline-dashboard.html
19. lead-import.html
20. lead-input-dashboard.html
21. leads.html
22. settings.html
23. signup.html
24. privacy.html
25. zapier-docs.html

---

## 📊 SUMMARY

| Category | Count | Action |
|----------|-------|--------|
| **Definitely keep** | 25 | ✅ Keep |
| **Safe to delete** | 8 | ❌ Delete |
| **Need investigation** | 6 | ⚠️ Review |
| **TOTAL** | **39** | |

---

## 🎯 RECOMMENDATION

### Immediate Action (Low Risk):
Delete these 8 files:
- test-api.html
- test-dashboard.html
- lead-tracking-dashboard-old.html
- client-acquisition-dashboard.html
- email-campaign.html
- landing-page.html
- lead-generator.html
- sales-tracker.html

**Result:** 39 → 31 HTML files (21% reduction)

### Further Investigation:
Check if these 6 files are linked/used anywhere:
- dashboard.html
- simple-dashboard.html
- decision-maker-finder.html
- sales-landing.html
- lead-sourcing-tool.html
- lead-finder.html

**Potential Result:** 31 → 25 HTML files (36% total reduction)

---

**Want me to delete the safe files now?**


