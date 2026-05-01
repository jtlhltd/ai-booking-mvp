// store.js — compatibility shim that forwards to db.js
//
// Layout note (do not be misled by the three similarly-named neighbours):
//   - db.js                 : authoritative DB layer (Postgres + SQLite + JSON
//                             fallback). All real reads/writes live here.
//   - db/<file>.js          : focused query clusters extracted out of db.js
//                             (e.g. db/call-queue-reads.js). Imported by db.js
//                             and re-exported, never imported directly by
//                             routes/lib code.
//   - store.js (this file)  : compatibility shim. Re-exports a curated subset
//                             of db.js plus the in-memory helpers under
//                             store/<file>.js (tenants, leads, twilio,
//                             optouts, contactAttempts). Keep callers that
//                             import './store.js' working without rewriting
//                             them; do NOT add new behavior here.
//   - store/<file>.js       : the small in-memory key/value tables backing
//                             the helpers above. Imported by store.js only.
//
// New code should import from db.js (or a db/<file>.js cluster) directly.

export {
  init,
  query,
  listFullClients,
  getFullClient,
  upsertFullClient,
  deleteClient,
  findOrCreateLead,
  setSmsConsent,
  storeProposedChoice,
  markBooked,
  DB_PATH,
} from './db.js';

export { tenants } from './store/tenants.js';
export { leads } from './store/leads.js';
export { twilio } from './store/twilio.js';
export { optouts } from './store/optouts.js';
export { contactAttempts } from './store/contact-attempts.js';

// Optional default export in case some code does `import store from './store.js'`
import * as db from './db.js';
import { tenants } from './store/tenants.js';
import { leads } from './store/leads.js';
import { twilio } from './store/twilio.js';
import { optouts } from './store/optouts.js';
import { contactAttempts } from './store/contact-attempts.js';

export default { ...db, tenants, leads, twilio, optouts, contactAttempts };
