# Tom / Call Bot split

## Context

- **Goal:** This repo becomes the **Call Bot** (dial, queue, Vapi, sequences, handoff storage). Tom (D2D Xpress) moves to a **new GitHub repo + Render service** as the first consumer.
- **Safety net:** DB backup at `D:\backups\ai-booking-mvp\20260630_111616\`, git tag `pre-tom-split-2026-06-30` on `4848ec2`.
- **Constraint:** Dialing/queue/webhook changes need `docs/INTENT.md` row + policy/canary gate + `npm run test:ci`.
- **Manual:** Copy Tom's Google Sheet before cutover.

## Definition of done

1. Call Bot exposes authenticated `/api/v1/*` and emits `call.completed` webhooks (HMAC-signed).
2. Tom app receives webhooks, writes Sheets, serves follow-up dashboard; dials via Call Bot API only.
3. Core skips logistics sheet writes when `LOGISTICS_SHEET_WRITES_IN_CORE=0`.
4. No hardcoded `d2d-xpress-tom` in production paths.
5. `npm run test:ci` green on both repos.

## Non-goals (phase 1)

- Full OpenAPI polish, calendar API, AB-test UI migration.
- Deleting Tom code from Call Bot (flags first).
- Non-Tom tenant migration.

## Work breakdown

- [x] Persist this plan
- [ ] Tenant `consumer_webhook_json` migration
- [ ] `lib/consumer-webhook-emitter.js` + vapi webhook hooks
- [ ] `LOGISTICS_SHEET_WRITES_IN_CORE` flag
- [ ] `routes/v1-callbot-mount.js`
- [ ] INTENT + canaries
- [ ] Remove Tom hardcodes from outbound-ab defaults
- [ ] `npm run test:ci`
- [ ] `d2d-xpress-app` repo scaffold
- [ ] Move vertical code to Tom app
- [ ] Tom webhook receiver
- [ ] Cutover docs
- [ ] Phase 4 cleanup (deprecated mounts, README)

## Risk & rollback

- Keep `LOGISTICS_SHEET_WRITES_IN_CORE=1` until Tom app proven.
- Rollback: redeploy tag `pre-tom-split-2026-06-30`; restore DB from backup if needed.
