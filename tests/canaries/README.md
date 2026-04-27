# Canaries — behavioral tests for "does what we want"

Canaries are Jest tests under `tests/canaries/*.canary.test.js`. They live in
their own folder so failures point at **intent** (a row in
[`docs/INTENT.md`](../../docs/INTENT.md)) rather than at an implementation
detail.

Each canary file should:

- Map 1:1 to an Intent Contract ID. The `describe(...)` block must include the
  ID so a failing canary is grep-able back to the rule.
- Assert **behavior**, not response shape. Examples:
  - "no call to `fetch('https://api.vapi.ai/call', ...)` happened"
  - "`addToCallQueue` was called with `priority: 9` and `callType: 'vapi_call'`"
  - "the 50 enqueued `scheduledFor` values are all distinct and span > 0 minutes"
- Use the contract harness (`tests/helpers/contract-harness.js`) and shared
  asserts (`tests/helpers/contract-asserts.js`) where applicable.
- Mock external IO (DB, `fetch`, time) — canaries are deterministic.

Canaries run as part of `npm run test:ci`. Run them in isolation with:

```bash
npm run test:canaries
```

When a "works but not what we want" bug is filed, the fix is incomplete until
a new canary in this folder reproduces the regression.
