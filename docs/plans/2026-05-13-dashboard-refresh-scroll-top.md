# Dashboard: start at top on full refresh

## Context

- User reports that after a **full page refresh** on `client-dashboard.html`, the viewport lands around the **middle/bottom** (e.g. Lead Management) instead of the **top**.
- Investigation: there is no `autofocus` on the leads search; `setLeadsFunnelSegment` only runs from **user** clicks and calls `scrollIntoView`. The likely cause is the browser’s **default scroll restoration** on reload combined with **layout height changes** after async data renders, so the restored pixel offset no longer matches “top of hero / metrics.”

## Definition of done

- After a normal reload of the client dashboard, the window starts at **scroll Y = 0** (top of page) without requiring the user to scroll up.
- No change to intentional in-page navigation (e.g. user clicking “↑ Metrics” or funnel chips that call `scrollIntoView`).
- No new failing tests; smoke: open dashboard, reload, confirm top alignment.

## Non-goals

- Changing scroll behavior for same-document SPA routes (this page is primarily full reloads).
- Persisting or restoring user scroll across sessions beyond browser defaults.

## Work breakdown

- [x] Set `history.scrollRestoration = 'manual'` and an initial `window.scrollTo(0, 0)` at the start of `initDashboard()` (guarded with try/catch).
- [ ] Manually verify reload behavior in browser (optional if CI only).

## Amendments

- Implemented in `public/client-dashboard.html` at the start of `initDashboard()` as above.
- **2026-05-13 (follow-up):** User still saw mid-page after refresh. Added: (1) early `<head>` script setting `scrollRestoration` and a one-shot `pageshow` → `scrollTo(0,0)` so correction runs after the browser’s restore pass; (2) `overflow-anchor: none` on `html` to reduce scroll anchoring when async blocks change height; (3) `focus({ preventScroll: true })` on call-history modal, follow-up cell edit, and paste import where supported so programmatic focus does not scroll the main document.
- **2026-05-13 (sequence viewport):** Session focus restoration on `#outboundSequencePhoneInput` (and similar) can scroll the window to the sequence card after reload. Replaced single `pageshow` scroll with `globalThis.__dashboardScrollTopNudge` (scroll top + blur focused `input/textarea/select` inside `#outboundSequenceWindow`) and scheduled rAF/timeouts; call nudge again after initial `Promise.all` async dashboard load.
- **2026-05-13 (sequence focus restore):** Blur **any** `document.activeElement` inside `#outboundSequenceWindow` (not only inputs)—`tabindex="0"` sequence rows can receive session focus and still pull the viewport.
- **2026-05-13 (late call-history paint):** `renderOutboundSequenceLeadDetail` fired `renderOutboundSequenceInlineHistory` without awaiting, so `refreshOutboundSequenceWindow` returned before `followUpRenderCallHistoryInto` finished inserting the large call-history DOM; the initial `Promise.all` scroll nudge ran too early. `renderOutboundSequenceLeadDetail` is now `async` and awaits inline history; `refreshOutboundSequenceWindow` awaits lead detail render.
- **2026-05-13 (late session focus):** Added capture `focusin` during a boot window to blur `input/textarea/select` inside `#outboundSequenceWindow`, extended timed nudges, `__dashboardArmScrollBootLock()` after async `Promise.all`, and `overflow-anchor: none` on `#outboundSequenceWindow` / `.outbound-seq-shell`.
- **2026-05-13 (scroll clamp):** During boot, listen for `window` `scroll` and if `scrollY > 6` before any user `pointerdown`/`wheel`/`touchstart`, force scroll back to top (catches focus-scroll paths that never hit our `focusin` filter). Longer boot window (5.2s), extra nudge at 4.5s, `overflow-anchor: none` on `body, html`, and explicit `documentElement`/`body` `scrollTop` in nudge.
- **2026-05-13 (pin header):** Centralized `pinDashboardToTop()` using `scrollingElement.scrollTop`, `window.scrollTo(0,0)`, and `header.header.scrollIntoView({ block: 'start' })`; exposed as `__dashboardPinToTop` for init fallback; boot scroll clamp and nudges use it; `keydown` counts as user intent to disable clamp.
- **2026-05-13 (clamp hardening):** Longer boot lock (7.2s), ignore untrusted/early `keydown` for user-intent, clamp when `doc.scrollTop>1` or `scrollY>1`, listen on `visualViewport` `scroll`, reset `visualViewport` offsets in pin, extra nudge at 6.2s, fix clamp cleanup to detach visualViewport listener.
- **2026-05-13 (focusin vs tabindex rows):** `capture focusin` still returned early for non-inputs, so session restore onto `div.outbound-seq-row[tabindex="0"]` or cohort **`<button>`**s never blurred — the browser scrolled those into view. `onBootFocusIn` now always pins once, then blurs buttons/links/tabindex targets (not `-1`), pins again, and double-`requestAnimationFrame` pin.

## Risk & rollback

- **Risk:** Disables automatic scroll restoration on this page for history navigations; this dashboard is typically opened/reloaded as a standalone document, so impact is low.
- **Rollback:** Remove the two lines in `initDashboard()` to restore browser default restoration.
