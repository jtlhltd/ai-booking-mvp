/**
 * Canary for Intent Contract: dial.no-direct-vapi-outside-worker
 *
 * Only allow-listed modules may directly POST https://api.vapi.ai/call.
 * Everything else must enqueue into call_queue and let the worker dial.
 */
import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());

const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  '.cursor',
  'archive',
  'coverage',
  'dist',
  'build',
  'public/build',
]);

const SCAN_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts']);

const ALLOW = new Set([
  'lib/instant-calling.js',
  'lib/follow-up-processor.js',
  'lib/vapi.js',
  'lib/mock-call-route.js',
  'lib/calendar-check-book.js',
  'routes/admin-vapi-plumbing-mount.js',
  'routes/admin-vapi-logistics-mount.js',
  'schedule-prospect-calls.js',
]);

const POST_CALL_RE = /fetch\s*\(\s*['"`]https?:\/\/api\.vapi\.ai\/call['"`]/;

function stripComments(src) {
  // Remove block comments first.
  let out = src.replace(/\/\*[\s\S]*?\*\//g, '');
  // Remove line comments. Naive but acceptable here — we are not parsing.
  out = out.replace(/(^|[^:\\])\/\/[^\n]*/g, (m, p1) => p1);
  return out;
}

function walk(relDir = '') {
  const absDir = path.join(root, relDir);
  let entries = [];
  try {
    entries = fs.readdirSync(absDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const out = [];
  for (const ent of entries) {
    if (IGNORE_DIRS.has(ent.name)) continue;
    const rel = relDir ? `${relDir}/${ent.name}` : ent.name;
    const abs = path.join(root, rel);
    if (ent.isDirectory()) {
      out.push(...walk(rel));
      continue;
    }
    if (!ent.isFile()) continue;
    const ext = path.extname(ent.name);
    if (!SCAN_EXTENSIONS.has(ext)) continue;
    out.push(rel.replace(/\\/g, '/'));
  }
  return out;
}

function findViolations() {
  const files = walk('');
  const violations = [];

  for (const rel of files) {
    if (ALLOW.has(rel)) continue;
    let src = '';
    try {
      src = fs.readFileSync(path.join(root, rel), 'utf8');
    } catch {
      continue;
    }
    const text = stripComments(src);
    if (POST_CALL_RE.test(text)) {
      const lines = src.split(/\r?\n/);
      const lineIdx = lines.findIndex((l) => POST_CALL_RE.test(l));
      violations.push({
        file: rel,
        line: lineIdx >= 0 ? lineIdx + 1 : 1,
        snippet: lineIdx >= 0 ? lines[lineIdx].trim() : '(match)',
      });
    }
  }

  return violations;
}

describe('canary: dial.no-direct-vapi-outside-worker', () => {
  test('repo contains no direct Vapi POST call sites outside allow-list', () => {
    const violations = findViolations();
    expect(violations).toEqual([]);
  });
});

