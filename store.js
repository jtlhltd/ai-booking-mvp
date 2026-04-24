// store.js — compatibility shim that forwards to db.js
// Keep routes that import "./store.js" working without touching them.

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
