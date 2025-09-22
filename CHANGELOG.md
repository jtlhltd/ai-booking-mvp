\# Changelog

All notable changes to this project will be documented here.

## [Unreleased]
- feat(dashboard): add real-time web dashboard for metrics and lead management
- fix(tenant): preserve tenantKey when updating existing leads to prevent VAPI call failures
- fix(sms): resolve all identified issues - tenant resolution, lead scoring, and metrics
- feat(hardening): implement comprehensive system hardening with error handling, retry logic, and security
- feat(quick-wins): implement real-time metrics dashboard, business hours detection, and lead scoring system
- feat(metrics): add comprehensive /admin/metrics endpoint with conversion rates and cost tracking
- feat(business-hours): implement intelligent call scheduling based on tenant business hours
- feat(lead-scoring): add AI-powered lead scoring with priority-based call routing
- feat(admin): add /admin/lead-score debug endpoint for lead analysis
- feat(mission): complete all missing logging tags, admin changes endpoint, and Google Calendar integration
- feat(logging): add [AUTO-CALL TRIGGER], [IDEMPOTENT SKIP], and [CALENDAR BOOKED] log tags
- feat(admin): add /admin/changes endpoint for runtime change feed tracking
- feat(calendar): integrate Google Calendar booking after successful VAPI calls
- feat(inbound): normalize phone helper + START behaves like YES
- fix(tenant): resolve inbound SMS by To-number (fallback MessagingServiceSid) with clear logs
- chore(test): run smoke tests for tenant resolution and opt-in flow
- chore(admin): add /admin/check-tenants endpoint to validate SMS config in Postgres
- fix(admin): use valid MessagingServiceSid for tenant configurations

