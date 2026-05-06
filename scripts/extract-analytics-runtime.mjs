import fs from 'node:fs';

const lines = fs.readFileSync('server.js', 'utf8').split(/\r?\n/);
const slice = lines.slice(919, 1382).join('\n'); // lines 920-1382 inclusive

const header = `import { getCache } from './cache.js';
import { getFullClient } from './db.js';

const cache = getCache();

`;

let body = slice
  .replace(/^async function /gm, 'export async function ')
  .replace(/^function /gm, 'export function ')
  .replace(/^const CACHE_TTL/gm, 'export const CACHE_TTL')
  .replace(/^const analyticsQueue/gm, 'export const analyticsQueue')
  .replace(/^let analyticsProcessing/gm, 'export let analyticsProcessing')
  .replace(/^const connectionPool/gm, 'export const connectionPool');

fs.writeFileSync('lib/server-analytics-runtime.js', `${header}${body}\n`);
console.log('wrote lib/server-analytics-runtime.js');
