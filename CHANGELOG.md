\# Changelog

All notable changes to this project will be documented here.

## [Unreleased]
- feat(mission): complete all missing logging tags, admin changes endpoint, and Google Calendar integration
- feat(logging): add [AUTO-CALL TRIGGER], [IDEMPOTENT SKIP], and [CALENDAR BOOKED] log tags
- feat(admin): add /admin/changes endpoint for runtime change feed tracking
- feat(calendar): integrate Google Calendar booking after successful VAPI calls
- feat(inbound): normalize phone helper + START behaves like YES
- fix(tenant): resolve inbound SMS by To-number (fallback MessagingServiceSid) with clear logs
- chore(test): run smoke tests for tenant resolution and opt-in flow
- chore(admin): add /admin/check-tenants endpoint to validate SMS config in Postgres
- fix(admin): use valid MessagingServiceSid for tenant configurations

