# Full dashboard speed-up pass

## Context

- User pain: dashboard keeps churning after KPIs appear; outreach panels were blank after `c1134e4`.
- Prior work: tiered loads, brief first fetch, gated full hydrate ([2026-05-15-dashboard-load-speed.md](./2026-05-15-dashboard-load-speed.md)).
- Gaps: serial boot, server `brief=1` still runs heavy SQL/A/B, tier-now API burst, poll pulls full payload.

## Definition of done

- Outreach: KPIs usable in ~1–2s; follow-up + sequence ~3s; recordings/voicemail/retry ~5–8s.
- `/api/clients` + `/api/demo-dashboard?brief=1` start in parallel for outreach.
- Server `brief=1` skips appointments, usage meters, outbound A/B enrichment.
- `npm run test:ci` passes.

## Non-goals

- Split `client-dashboard.html`, Redis cache, dial/queue behavior changes.

## Work breakdown

- [x] Phase 0: Outreach deferred panel fix (recordings/voicemail/retry)
- [x] Phase 1: Parallel boot, OUTREACH_FALLBACK, early KPI paint
- [x] Phase 2: Server brief gating + contract test
- [x] Phase 3: Slim tier-now, staggered deferred, lazy viewport, 30s hydrate, brief poll
- [x] Phase 5: `npm run test:ci`

## Risk & rollback

- `window.__dashboardDeferSecondaryLoads = false` restores eager client loads.
- Server: omit `?brief=1` to get full enrichment (default).
