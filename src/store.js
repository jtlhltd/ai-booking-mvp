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

// Optional default export in case some code does `import store from './store.js'`
import * as db from './db.js';
export default db;
