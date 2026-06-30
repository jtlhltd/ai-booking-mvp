# Finish Tom / Call Bot split

## Context

- Tom app (`d2d-xpress-app`) is live on Render; Vapi tools and `consumer_webhook_json` point at it.
- Call Bot still serves Tom vertical routes and core sheet writes by default (rollback overlap).
- Product goal: clients use **Call Bot via `/api/v1` + webhooks only**; operator CRM lives in client apps.

## Definition of done

- Render `ai-booking-mvp`: `LOGISTICS_SHEET_WRITES_IN_CORE=0`, `DISABLE_TOM_VERTICAL_ROUTES=1`.
- Tom vertical mounts removed from Call Bot (not just env-gated).
- Default for logistics writes in core is **off**; docs/env example updated.
- `docs/INTENT.md` + policy/canary updated for finished split.
- `npm run test:ci` passes (or Windows leak lane documented if env-only).

## Non-goals

- Delete Tom tenant row or stop dialing for `d2d-xpress-tom`.
- Move generic outbound/dashboard features that other tenants use.
- Tom app feature parity (email on schedule_callback, full dashboard).

## Work breakdown

- [x] Flip Render env on `ai-booking-mvp`
- [x] Remove Tom vertical routers from `mount-api.js` / `mount-admin-tools.js`
- [x] Default `isLogisticsSheetWritesInCoreEnabled` to off; strip dead sheet paths or keep minimal no-op
- [x] Update `.env.example`, `CALLOPT_CUTOVER.md`, README
- [x] INTENT + `check-policy.mjs` + canaries
- [x] Fix tests referencing removed routes
- [x] Run `npm run test:ci`

## Amendments

- 2026-06-30: Split finished — vertical mounts deleted (not env-gated); logistics writes default off; Render env flipped.
- 2026-06-30: Deleted Tom vertical route modules from Call Bot; smoke script + policy file gate added.

## Risk & rollback

- **Risk:** Live Tom call loses sheet row if Tom app/webhook down.
- **Rollback:** Render env `LOGISTICS_SHEET_WRITES_IN_CORE=1`, `DISABLE_TOM_VERTICAL_ROUTES=0`; redeploy; re-mount routes from git tag `pre-tom-split-2026-06-30` if needed.
