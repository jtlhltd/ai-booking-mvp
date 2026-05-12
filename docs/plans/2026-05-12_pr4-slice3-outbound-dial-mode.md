# PR4 slice 3 — `outboundDialMode` stamp + dedupe merge

## Context

- Slices 1 and 2 are complete: `lead_dial_context_json` exists, the queue worker reads it, and `callLeadInstantly` applies the sanitized variable overlay.
- The next locked behavior is queue snapshot freezing: outbound queue rows must carry `call_data.outboundDialMode` so later tenant config flips do not silently reinterpret already-queued work.
- The most dangerous regression in this slice is the dedupe path in `addToCallQueue`, which currently updates `scheduled_for` / `priority` without merging `call_data`.

## Definition of done

- Every outbound `addToCallQueue(... callType: 'vapi_call' ...)` site stamps `call_data.outboundDialMode` as `classic` or `sequence` when it knows the mode.
- `db/domains/call-queue.js` merges `outboundDialMode` on the Postgres and SQLite dedupe/update paths using the locked truth table from the PR4 plan.
- `docs/INTENT.md` includes a row for dial-mode freeze behavior, and at least one canary proves the dedupe truth table.
- `npm run test:ci` passes.

## Non-goals

- No webhook `_importContext` work yet.
- No dashboard filter work yet.
- No new Vapi call sites or queue execution semantics beyond snapshot stamping and dedupe merge.

## Work breakdown

- [x] Stamp `outboundDialMode` on all relevant outbound enqueue call sites.
- [x] Implement the dedupe merge truth table in `db/domains/call-queue.js` for Postgres and SQLite.
- [x] Add/update unit/integration/canary coverage for the freeze behavior.
- [x] Update `docs/INTENT.md`.
- [x] Run `npm run test:ci`.

## Risk and rollback

- Risk: silently downgrading `sequence` to `classic` during dedupe would break queued sequence work after a tenant config flip.
- Mitigation: make the merge table explicit in code and assert it in tests/canaries.
- Rollback: revert this slice; existing queue rows remain readable because `outboundDialMode` is stored in JSON and optional.
