# Dashboard outreach panel load fix

## Context

- After `c1134e4` (tiered secondary loads), outreach dashboards (`isOutreachDashboardClient`) skip `renderCallRecordings`, `renderVoicemailListener`, and `renderRetryQueue` in deferred tier because they were grouped with `tom-hide-for-outreach` panels (calendar, integration health, system status).
- Those three panels remain visible on Tom/outreach UI; users see blank cards (never fetched).
- Call quality / weekly chart may show zeros from real 7d API/brief data — separate from “never loaded”.

## Definition of done

- Outreach dashboard: Call Recordings, Voicemail Listener, and Retry Queue fetch and show data or empty/error states after load.
- Non-outreach behavior unchanged: hidden panels still skipped for outreach; calendar/integration/system still outreach-only skip.
- Deferred tier still runs ~2.5s after first paint; guaranteed `setTimeout` fallback if idle scheduling fails.
- `renderCallRecordings` shows error UI on fetch failure (not blank).
- `npm run check:policy` passes (no behavioral dial changes).

## Non-goals

- Reverting brief-first lead hydrate or full `Promise.all` boot.
- Changing call-quality / weekly chart metrics logic unless still broken after panel fix.

## Work breakdown

- [x] Fix `runDashboardDeferredLoads`: load recordings/voicemail/retry for outreach; keep outreach skip only for hidden panels.
- [x] Remove outreach-only skip of `renderRetryQueue` from tier-now (load in deferred for all).
- [x] Add guaranteed deferred fallback timer in `scheduleDashboardDeferredLoads`.
- [x] Harden `renderCallRecordings` loading + error empty state.
- [ ] Manual smoke: Tom tenant hard refresh; verify three panels populate.

## Amendments

- 2026-05-15: `repaintCallRecordingsList` paints empty state when cache is cleared; deferred panels get placeholder copy until fetch runs.

## Risk & rollback

- **Risk:** Slightly more API traffic on outreach first visit (3 endpoints deferred). Acceptable; same as pre-`c1134e4`.
- **Rollback:** Set `window.__dashboardDeferSecondaryLoads = false` before init, or revert tier function changes.
