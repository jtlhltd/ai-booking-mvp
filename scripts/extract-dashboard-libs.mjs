import fs from 'node:fs';

const lines = fs.readFileSync('server.js', 'utf8').split(/\r?\n/);

function r(a, b) {
  return lines.slice(a - 1, b).join('\n');
}

function exp(code) {
  return code
    .replace(/^function /gm, 'export function ')
    .replace(/^async function /gm, 'export async function ');
}

fs.writeFileSync('lib/vapi-timeline-snapshot.js', `${exp(r(851, 983))}\n`);

const dash = exp([r(546, 850), r(985, 990), r(1094, 1180), r(1218, 1228)].join('\n\n'));
fs.writeFileSync('lib/dashboard-ui-formatters.js', `${dash}\n`);

const retryHeader = `import { poolQuerySelect } from '../db.js';
import { allowOutboundWeekendCalls, clampOutboundDialToAllowedWindow } from './business-hours.js';
import { resolveTenantTimezone } from './timezone-resolver.js';

const DEFAULT_TZ = process.env.TZ || process.env.TIMEZONE || 'Europe/London';

`;

let retryBody = exp(r(1032, 1092));
retryBody = retryBody.replace(
  /return clampOutboundDialToAllowedWindow\(tenant, raw, pickTimezone\(tenant\)\)/,
  'return clampOutboundDialToAllowedWindow(tenant, raw, resolveTenantTimezone(tenant, DEFAULT_TZ))'
);

fs.writeFileSync('lib/retry-queue-display.js', `${retryHeader}${retryBody}\n`);

console.log('lib/vapi-timeline-snapshot.js, lib/dashboard-ui-formatters.js, lib/retry-queue-display.js written');
