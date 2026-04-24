#!/usr/bin/env node
/**
 * Compare routes/*.js to tests that import them (string match routes/<file>).
 * Prints route files with no matching test reference — a drift guard, not proof of coverage depth.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const routeDir = path.join(root, 'routes');

function listRouteJsFiles(dir, rel = '') {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const name = rel ? `${rel}/${ent.name}` : ent.name;
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...listRouteJsFiles(abs, name));
    } else if (ent.isFile() && ent.name.endsWith('.js')) {
      out.push(name.replace(/\\/g, '/'));
    }
  }
  return out.sort();
}

const routeFiles = listRouteJsFiles(routeDir);

function walkTests(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === 'archive') continue;
      walkTests(p, acc);
    } else if (ent.isFile() && (ent.name.endsWith('.test.js') || ent.name.endsWith('.spec.js'))) {
      acc.push(p);
    }
  }
  return acc;
}

const testFiles = walkTests(path.join(root, 'tests'));
const testContents = testFiles.map((f) => ({ file: path.relative(root, f), text: fs.readFileSync(f, 'utf8') }));

const missing = [];
for (const rf of routeFiles) {
  const needle = `routes/${rf}`;
  const hit = testContents.some((t) => t.text.includes(needle));
  if (!hit) missing.push(rf);
}

console.log(`Route modules: ${routeFiles.length}`);
console.log(`Test files scanned: ${testFiles.length}`);
if (missing.length) {
  console.log(`\nNo test file references "${missing[0].split('/').pop()}" pattern (routes/<name>):`);
  for (const m of missing) console.log(`  - routes/${m}`);
  process.exitCode = 1;
} else {
  console.log('\nEvery routes/*.js is referenced by at least one test file path string.');
}
