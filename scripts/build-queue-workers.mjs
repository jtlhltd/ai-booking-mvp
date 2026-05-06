import fs from 'node:fs';

const header = `import { DateTime } from 'luxon';
import { nanoid } from 'nanoid';
import {
  query,
  poolQuerySelect,
  getFullClient,
  listFullClients,
  addToCallQueue,
  smearCallQueueScheduledFor,
  invalidateClientCache,
} from '../db.js';
import {
  isBusinessHoursForTenant,
  getNextBusinessOpenForTenant,
  allowOutboundWeekendCalls,
} from './business-hours.js';
import { resolveTenantTimezone } from './timezone-resolver.js';
import { pgQueueLeadPhoneKeyExpr } from './lead-phone-key.js';
import { isTransientVapiQueueResult, isNoCreditsVapiResult } from './vapi-queue-result.js';
import { setLastDialBlock } from './ops-state.js';
import { callLeadInstantly } from './instant-calling.js';
import { createCallWithKey as vapiCreateCallWithKey } from './vapi.js';

const TIMEZONE = process.env.TZ || process.env.TIMEZONE || 'Europe/London';

function isBusinessHours(tenant = null) {
  const tz = tenant?.booking?.timezone || tenant?.timezone || TIMEZONE;
  return isBusinessHoursForTenant(tenant, new Date(), tz, { forOutboundDial: true });
}

function getNextBusinessHour(tenant = null) {
  const tz = tenant?.booking?.timezone || tenant?.timezone || TIMEZONE;
  return getNextBusinessOpenForTenant(tenant, new Date(), tz, { forOutboundDial: true });
}

function pickTimezone(client) {
  return resolveTenantTimezone(client, TIMEZONE);
}

`;

let body = fs.readFileSync('lib/_queue_extract.js', 'utf8');
body = body.replaceAll("from './db.js'", "from '../db.js'");
body = body.replaceAll('from "./db.js"', 'from "../db.js"');
body = body.replace(/import\(['"]\.\/db\.js['"]\)/g, "import('../db.js')");
body = body.replace(/import\(['"]\.\/lib\//g, "import('./");
body = body.replace('async function processRetryQueue', 'export async function processRetryQueue');
body = body.replace('async function processCallQueue', 'export async function processCallQueue');
body = body.replace('async function processVapiCallFromQueue', 'export async function processVapiCallFromQueue');
body = body.replace('async function queueNewLeadsForCalling', 'export async function queueNewLeadsForCalling');

fs.writeFileSync('lib/server-queue-workers.js', `${header}${body}\n`);
console.log('wrote lib/server-queue-workers.js');
