#!/usr/bin/env node
/**
 * Clear pending call queue. Uses DATABASE_URL from env.
 * Usage:
 *   node scripts/clear-call-queue.js                    # clear all pending
 *   node scripts/clear-call-queue.js --phone +447491683261  # clear only this number
 *   node scripts/clear-call-queue.js --client d2d-xpress-tom  # clear only this client
 */
import 'dotenv/config';
import { clearCallQueue } from '../db.js';

const args = process.argv.slice(2);
let clientKey, leadPhone;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--client' && args[i + 1]) clientKey = args[++i];
  else if (args[i] === '--phone' && args[i + 1]) leadPhone = args[++i];
}

const deleted = await clearCallQueue({ clientKey, leadPhone });
console.log('Cleared', deleted, 'pending call(s).', clientKey ? `(client: ${clientKey})` : '', leadPhone ? `(phone: ${leadPhone})` : '');
process.exit(0);
