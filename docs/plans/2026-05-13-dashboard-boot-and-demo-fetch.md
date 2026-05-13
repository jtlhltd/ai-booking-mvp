# Context

- Users still see key metric hints stuck on **"Loading..."** after the brace fix; we need runtime resilience and correct demo data loading.
- `fetchLiveData` currently skips the network for `demo_client` and returns `null`, so the dashboard never uses `/api/demo-dashboard/demo_client` on the demo URL.
- `initDashboard` is only wired to `DOMContentLoaded`; failures inside the async function are easy to miss without an explicit `.catch`.

# Definition of done

- `fetchLiveData` uses the same `/api/demo-dashboard/:clientKey` path for **demo and non-demo** keys (still read-only GET).
- Dashboard boot uses a small `scheduleDashboardBoot` helper with `{ once: true }` and logs `initDashboard` rejections.
- `updateStatusBar` wraps its body in `try/catch` so one bad DOM branch cannot leave tiles stuck on the HTML default "Loading...".
- Inline script still parses (`new Function` on extracted script succeeds).
- `npm run test:ci` passes locally.

# Non-goals

- Rewriting the entire dashboard script or removing the temporary closing `}` until a dedicated brace-audit lands.
- Changing server `/api/demo-dashboard` semantics or auth.

# Work breakdown

- [x] Refactor `fetchLiveData` in `public/client-dashboard.html` to always perform the bounded fetch (remove demo-only early `return null` path).
- [x] Replace `document.addEventListener('DOMContentLoaded', initDashboard)` with `scheduleDashboardBoot()` + `.catch` logging.
- [x] Wrap `updateStatusBar` body in `try/catch` with `console.error`.
- [x] Re-verify script parse; run `npm run test:ci`.

# Amendments

- None.

# Risk & rollback

- **Risk:** Slightly more traffic to `/api/demo-dashboard` for demo sessions (one GET per load / poll as before for non-demo).
- **Rollback:** Revert the three edits in `public/client-dashboard.html` on this branch.
