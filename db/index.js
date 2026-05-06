// db/index.js — thin composer so db.js can remain a stable facade.
import * as dbFacade from '../db.js';

export function createDb() {
  // Today we simply return the existing db.js export surface.
  // Over time, db.js can shrink further while db/index.js composes domain modules.
  return dbFacade;
}

