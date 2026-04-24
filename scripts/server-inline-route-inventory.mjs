#!/usr/bin/env node
/**
 * Inventory inline Express routes in server.js.
 *
 * This is a drift guard and a prioritization aid. It does not try to fully parse JS.
 * It looks for simple patterns like: app.get('/path', ...) or app.post(\"/path\", ...).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const serverPath = path.join(root, 'server.js');

const src = fs.readFileSync(serverPath, 'utf8').split(/\n/);

const routes = [];
const re = /\bapp\.(get|post|put|patch|delete)\(\s*(['"`])([^'"`]+)\2\s*,/;
for (let i = 0; i < src.length; i += 1) {
  const line = src[i];
  if (/^\s*\/\//.test(line)) continue; // ignore single-line comments
  const m = line.match(re);
  if (!m) continue;
  routes.push({ method: m[1].toUpperCase(), path: m[3], line: i + 1 });
}

function isMutation(r) {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method);
}
function isAdmin(r) {
  return r.path.startsWith('/admin') || r.path.startsWith('/tools');
}

const groups = [
  { title: 'AdminAndTools', filter: (r) => isAdmin(r) },
  { title: 'Mutations', filter: (r) => isMutation(r) && !isAdmin(r) },
  { title: 'Reads', filter: (r) => !isMutation(r) && !isAdmin(r) }
];

console.log(`# Inline server.js route inventory\n`);
console.log(`Source: ${serverPath}\n`);
console.log(`Total: ${routes.length}\n`);

for (const g of groups) {
  const list = routes.filter(g.filter).sort((a, b) => a.line - b.line);
  console.log(`## ${g.title} (${list.length})\n`);
  for (const r of list) {
    console.log(`- \`${r.method} ${r.path}\` (server.js:${r.line})`);
  }
  console.log('');
}

