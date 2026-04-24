## “Done once and for all” checklist

### CI + regression protection
- `npm run test:ci` is green.
- `npm run test:route-inventory` is green (every `routes/*.js` is exercised by tests).
- `npm run test:server-inline-inventory` is green (keeps `server.js` wiring-only).
- CI enforces deterministic env (timezone set to UTC).

### Journey behavior locks (contracts)
- **Lead intake → booking**
  - `/api/leads` contracts: auth/headers, validation fail, happy path, side-effects invoked.
  - `/api/calendar/*` contracts: find-slots, book-slot, check-book, cancel, reschedule including at least one failure path each.
- **SMS consent**
  - Twilio inbound contracts: STOP mutates; YES/START do not mutate; unknown tenant no-op.
  - Status webhook contracts/unit coverage: failed/delivered paths don’t break Twilio response.
- **Admin ops**
  - At least one representative mount has 401+happy contract (admin key required).
  - One call-queue status contract exists.
- **Onboarding/portal**
  - `/api/signup` contracts: 400 missing, 409 duplicate, 42P01 remediation failure, happy path.

### Core invariants (unit tests)
- Tenant isolation and permission gates (middleware/security).
- Idempotency: duplicate detection and record failure non-fatal.
- Opt-out compliance: STOP always blocks downstream side-effects.
- Booking correctness: conflict checks, gcal failure mapping, deterministic IDs.

### Maintainability / seams
- Shared fixtures exist and are used where appropriate (`tests/helpers/fixtures.js`).
- Shared determinism helpers exist and are used where appropriate (`tests/helpers/determinism.js`).
- `store.js` exposes domain modules (`store/*`) rather than being a pure alias of `db.js`.

