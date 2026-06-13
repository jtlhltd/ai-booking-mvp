# Render Deploy Poller Monitor Schedule

## Context

- Sentry issue `AI-BOOKING-MVP-8` is a live `monitor_check_in_failure` for `render-deploy-failure-poller`.
- The poller is scheduled locally at `11-59/5 * * * *` (`:11,:16,...`).
- The Sentry monitor registration currently reports `7,12,17,22,27,32,37,42,47,52,57 * * * *`, which does not match the actual node-cron cadence.
- This is an ops-only surface; it does not touch dialing, tenant routing, billing, or inbound webhook mutation behavior.

## Definition of Done

- The Sentry monitor schedule for `render-deploy-failure-poller` matches the cron cadence that actually invokes it.
- Focused tests cover the schedule registration so future drift fails locally.
- Required test commands run: `npm run test:unit` and `npm run test:integration-lite`.
- If the change is GREEN risk, open a PR, mark it ready, merge after required CI, verify service health, verify the culprit monitor/deploy state, and resolve/post Slack completion where possible.

## Non-goals

- Do not change Render deploy polling logic or webhook forwarding behavior.
- Do not change self-heal probe semantics for `/heal-test` or `/automation-smoke`.
- Do not alter outbound dialing, queue processing, tenant lookup, billing gates, or webhook signature policy.

## Work Breakdown

- [ ] Confirm issue details and skip/risk tier.
- [ ] Patch `lib/scheduled-jobs.js` so the Render deploy failure Sentry monitor uses an offset-11 crontab.
- [ ] Add focused Jest coverage for core cron schedules and Sentry monitor options.
- [ ] Run required local tests after dependency install completes.
- [ ] Commit and push the branch.
- [ ] Open/ready PR, then ship and verify if GREEN.

## Risk & Rollback

- Risk: changing the monitor schedule could create a new monitor in Sentry if the SDK treats schedule changes unexpectedly; the slug remains unchanged to avoid this.
- Risk: tests may expose unrelated existing failures; keep the code diff limited and report unrelated failures separately.
- Rollback: revert the single commit to restore the prior Sentry monitor schedule.

## Amendments

- CI failed before Jest on the route inventory gate because `routes/sentry-cursor-relay-mount.js` was not referenced by a route test path string. Add a minimal alias contract in the existing Sentry relay route contract test; no runtime relay behavior changes.
