# Dashboard load speed

## Context
- User pain: full load churn after KPIs appear (outreach/Tom dashboard).
- Root causes: auto 5k `demo-dashboard` hydrate, 15+ parallel panel APIs, follow-up handoff batch, heavy lead list DOM.
- Must not regress boot/init; keep follow-up + sequence panel priority.

## Definition of done
- After brief load, network settles in ~3–5s (Tier Now only).
- Full lead list via explicit control, scroll, or idle trigger.
- `npm run test:ci` passes.

## Non-goals
- Split HTML file, API caching, server query refactor (Phase 4 only if needed).

## Work breakdown
- [x] Tier secondary loads (Now vs Deferred); dedupe integration-health
- [x] Gate full hydrate (no auto `brief:false`)
- [x] Defer follow-up handoff batch + stats
- [x] Chunked `repaintRecentLeadsList`
- [x] Lazy-load SheetJS
- [x] Verify CI

## Risk & rollback
- Flag `window.__dashboardDeferSecondaryLoads = false` or revert commit to restore auto full hydrate.
