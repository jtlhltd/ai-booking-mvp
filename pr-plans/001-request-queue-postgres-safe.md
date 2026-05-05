## PR plan: Make `request-queue` Postgres-safe and bounded

### Why
`lib/request-queue.js` currently uses `call_queue` for non-`vapi_call` work, but:
- It marks rows `completed` without `initiated_call_id`, which likely violates the Postgres constraint added in `db.js` (`call_queue_completed_requires_call_id`).
- Its retry logic uses `item.retry_attempt` which is not a `call_queue` column, so retries never increment and can loop forever.

This is both a **reliability** and **spend/backpressure** risk.

### Scope
- **Code**: `lib/request-queue.js`, `db.js`
- **Tests**: add/extend DB-focused tests under `tests/integration/` (SQLite + optional Postgres), and add a small unit test for retry bounding logic.
- **Intent/enforcement**:
  - Keep existing intent `queue.no-phantom-completed` for `vapi_call`.
  - Add a new intent row (recommended) for bounded retries on request-queue rows, enforced by a canary or unit test.

### Proposed changes

1) **Narrow the DB constraint to only apply to outbound Vapi dials**
- In `db.js` where the constraint is created, change it from:\n
  `CHECK (status <> 'completed' OR initiated_call_id IS NOT NULL)`\n
  to:\n
  `CHECK (status <> 'completed' OR call_type <> 'vapi_call' OR initiated_call_id IS NOT NULL)`

2) **Persist retry attempts for request-queue rows**
Pick one (prefer A for simplicity):
- **A (schema)**: add `retry_attempt INTEGER DEFAULT 0` to `call_queue` for non-vapi rows.\n
  - Update `lib/request-queue.js` to increment this column when rescheduling.\n
  - Ensure `addToCallQueue` / existing code paths for `vapi_call` set/ignore it safely.
- **B (call_data)**: store attempt count in `call_data.retryAttempt` and update atomically.\n
  - Avoid schema changes but requires JSON update logic and careful Postgres/SQLite compatibility.

3) **Ensure request-queue completion path is consistent**
- When marking a non-`vapi_call` row completed, do not touch `initiated_call_id` (constraint will no longer apply).
- For failure cases, after `maxAttempts`, set `status='failed'` deterministically.

### Acceptance criteria
- **Correctness**:
  - A failing request-queue item transitions `pending → processing → pending (rescheduled)` up to `N` attempts, then becomes `failed`.
  - A successful request-queue item becomes `completed` on Postgres without constraint errors.
- **No regressions for dialing intents**:
  - `queue.no-phantom-completed` still holds for `call_type='vapi_call'`.

### Tests / gates to add
- **Unit**: `tests/unit/lib/request-queue.retry-bounded.test.js`\n
  - Force a deterministic failure and assert attempt increments and terminal failure.
- **Integration (SQLite)**: extend `tests/integration/db-sqlite-queue-and-journey.test.js`\n
  - Enqueue `sms_send` and simulate a failure path; assert it doesn’t loop forever.
- **(Optional) Postgres integration**: gated by `RUN_NATIVE_INTEGRATION=1` + `TEST_DATABASE_URL`\n
  - Assert non-vapi completion succeeds under the constraint.

### Rollout / verification
- Deploy and confirm `GET /api/ops/intent-status` remains green.\n
- Confirm request-queue backlog is stable (pending rows don’t churn forever).

