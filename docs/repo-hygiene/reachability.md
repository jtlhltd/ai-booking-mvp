# Reachability map (UI + legacy pages)

## Canonical HTML routing

Two mechanisms serve UI pages:

1. `express.static('public')` in `app/create-app.js`
   - Any file physically present under `public/` is served directly at `/<filename>`.

2. Named routes in `routes/static-pages.js`
   - These only run when `express.static` does **not** find a matching file path.
   - Some routes serve Vite builds from `public/build/**` when present, else fall back to a legacy HTML file in `public/`.

## Named HTML routes (keep-required legacy files)

From `routes/static-pages.js`, these legacy HTML files are directly referenced and must remain present (or be replaced by a route change) to avoid 404s when Vite build output is missing:

- `/` → `public/index.html`
- `/tenant-dashboard` → `public/tenant-dashboard.html`
- `/client-dashboard` → fallback `public/client-dashboard.html` (prefers `public/build/pages/client-dashboard/index.html`)
- `/client-setup` → `public/client-setup.html`
- `/client-template` → `public/client-dashboard-template.html`
- `/setup-guide` → `public/client-setup-guide.html`
- `/onboarding` → `public/onboarding-dashboard.html`
- `/onboarding-templates` → `public/onboarding-templates.html`
- `/onboarding-wizard` → `public/client-onboarding-wizard.html`
- `/uk-business-search` → fallback `public/uk-business-search.html` (prefers `public/build/pages/uk-business-search/index.html`)
- `/decision-maker-finder` → fallback `public/decision-maker-finder.html` (prefers `public/build/pages/decision-maker-finder/index.html`)
- `/cold-call-dashboard` → `public/cold-call-dashboard.html`
- `/vapi-test-dashboard` → `public/vapi-test-dashboard.html`
- `/admin-hub` and `/admin-hub.html` → fallback `public/admin-hub-enterprise.html` (prefers `public/build/pages/admin-hub/index.html`)
- `/pipeline` → `public/pipeline-kanban.html`

## Archive candidates (legacy `public/*.html` not referenced by `routes/static-pages.js`)

These files are served only by `express.static('public')` (i.e. reachable only if someone knows the direct URL), and are not referenced by `routes/static-pages.js`.

They are candidates to move under `archive/public-pages/` per the hygiene plan:

- `public/admin-call-monitor.html`
- `public/admin-client-onboarding.html`
- `public/admin-hub.html`
- `public/admin-hub-enhanced.html`
- `public/booking-dashboard.html`
- `public/booking-simple.html`
- `public/dashboard-v2.html`
- `public/dashboard.html`
- `public/discovery-dashboard.html`
- `public/landing.html`
- `public/leads.html`
- `public/lead-finder.html`
- `public/lead-import.html`
- `public/lead-input-dashboard.html`
- `public/lead-sourcing-tool.html`
- `public/lead-tracking-dashboard.html`
- `public/new-client-onboarding.html`
- `public/privacy.html`
- `public/sales-landing.html`
- `public/settings.html`
- `public/simple-dashboard.html`
- `public/signup.html`
- `public/sms-pipeline-dashboard.html`
- `public/client-profile.html`

