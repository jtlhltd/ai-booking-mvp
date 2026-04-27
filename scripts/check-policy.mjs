#!/usr/bin/env node
/**
 * Static policy checker — fast (~1s) gate run as part of CI.
 *
 * Each rule is tied to an ID in docs/INTENT.md. A rule fails when its
 * `pattern` matches a file that is NOT in `allow` (or, when `scope` is set,
 * matches any file under `scope` that is not allow-listed).
 *
 * Add a rule here in the same PR that adds/changes a row in
 * docs/INTENT.md. See .cursor/rules/behavioral-gates.mdc.
 *
 * Usage:
 *   node scripts/check-policy.mjs
 *   node scripts/check-policy.mjs --json   # machine-readable output
 *
 * Exit codes:
 *   0 — clean
 *   1 — at least one rule violated
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

// -----------------------------------------------------------------------------
// Rules
//
// `pattern` — regex applied per-file (multiline).
// `allow`   — list of file paths or directory prefixes (POSIX-style, repo-relative).
//             A file is allow-listed when its path equals an entry, or starts
//             with any directory entry (must end with '/').
// `scope`   — optional directory prefix (POSIX-style, ending '/'). When set,
//             only files under this prefix are checked. (Use this for "must
//             not appear in routes/" style rules.)
// `intentId` — anchor in docs/INTENT.md.
// -----------------------------------------------------------------------------
const rules = [
  {
    intentId: 'dial.no-direct-vapi-outside-worker',
    description:
      'Only the queue worker / Vapi helper / mock + admin tools may POST https://api.vapi.ai/call. Routes/imports/recalls must enqueue via call_queue.',
    // Match call *initiation* only (POST to bare /call). The status fetch URL
    // (/call/{id}) is read-only and intentionally excluded.
    pattern: /fetch\s*\(\s*['"`]https?:\/\/api\.vapi\.ai\/call['"`]/,
    allow: [
      'lib/instant-calling.js',
      'lib/follow-up-processor.js',
      'lib/vapi.js',
      'lib/mock-call-route.js',
      'lib/calendar-check-book.js',
      'routes/admin-vapi-plumbing-mount.js',
      'routes/admin-vapi-logistics-mount.js',
      'routes/call-recordings.js',
      'routes/demo-dashboard-debug.js',
      'schedule-prospect-calls.js',
      // Legacy debt: server.js still has two inline call-initiation sites.
      // Keep them allow-listed until they are extracted to the queue worker
      // (tracked as a follow-up; do NOT add new sites here).
      'server.js',
      'tests/',
      'scripts/',
      'docs/'
    ]
  },
  {
    intentId: 'dial.imports-distribute-not-burst',
    description:
      'Imported lead lists must be enqueued via runOutboundCallsForImportedLeads. routes/import-leads.js must NOT call processCallQueue() directly.',
    // We are strict here: any call-site in routes/ is a violation.
    // (Definitions in lib/ and the /scheduled-jobs.js worker are out of scope.)
    scope: 'routes/',
    pattern: /\bprocessCallQueue\s*\(/,
    allow: [
      // No allow-list under routes/. Every match is a violation.
    ]
  },
  {
    intentId: 'dial.recall-goes-through-scheduler',
    description:
      'POST /api/leads/recall must enqueue via addToCallQueue + scheduleAtOptimalCallWindow, not fetch Vapi directly. (Covered by dial.no-direct-vapi-outside-worker, but checked separately to localize the failure message.)',
    scope: 'routes/leads-followups.js',
    pattern: /fetch\s*\(\s*['"`]https?:\/\/api\.vapi\.ai\/call['"`]/,
    allow: []
  },
  {
    intentId: 'tenant.no-internal-key-leak',
    description:
      'The internal tenant key d2d-xpress-tom must not appear in customer-facing surfaces. db.js (seed), tests, scripts, demos, docs, and the dashboard HTML comments are allow-listed.',
    pattern: /d2d-xpress-tom/,
    allow: [
      // Backing data and seed configuration.
      'db.js',
      '.env.example',
      // Docs / tests / scripts / demos describe the tenant by name; safe.
      'docs/',
      'tests/',
      'scripts/',
      'demos/',
      // Public dashboard HTML only references the slug in comments and
      // an explicit "DEMO_DATA must NOT load for d2d-xpress-tom" guard.
      'public/client-dashboard.html',
      // Code comments / fallback constants — these do not appear in payloads.
      'server.js',
      'lib/instant-calling.js'
    ]
  },
  {
    intentId: 'tenant.no-internal-key-in-vapi-payloads',
    description:
      'Belt-and-braces: anywhere we build a Vapi payload, the literal tenant slug must not be hard-coded.',
    // Only check files that actually build Vapi payloads.
    scope: 'lib/',
    // Match the literal slug in non-comment code; comments are stripped before
    // matching (see scanFile).
    pattern: /['"`]d2d-xpress-tom['"`]/,
    allow: [
      // The instant-calling worker references the slug only in a comment.
      'lib/instant-calling.js'
    ]
  }
];

// -----------------------------------------------------------------------------
// Walker — collect all files we care about, ignoring noisy paths.
// -----------------------------------------------------------------------------
const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  '.cursor',
  'archive',
  'coverage',
  'dist',
  'build'
]);

const SCAN_EXTENSIONS = new Set([
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.html',
  '.json'
]);

function listFiles(dir, rel = '', acc = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const ent of entries) {
    if (IGNORE_DIRS.has(ent.name)) continue;
    const abs = path.join(dir, ent.name);
    const relPath = rel ? `${rel}/${ent.name}` : ent.name;
    if (ent.isDirectory()) {
      listFiles(abs, relPath, acc);
    } else if (ent.isFile()) {
      const ext = path.extname(ent.name);
      if (SCAN_EXTENSIONS.has(ext)) {
        acc.push(relPath.replace(/\\/g, '/'));
      }
    }
  }
  return acc;
}

// -----------------------------------------------------------------------------
// Allow-list match: file path matches any of the entries. A trailing "/" entry
// matches a directory prefix; otherwise an exact file path match is required.
// -----------------------------------------------------------------------------
function isAllowed(filePath, allow = []) {
  for (const entry of allow) {
    if (entry.endsWith('/')) {
      if (filePath === entry.replace(/\/$/, '') || filePath.startsWith(entry)) {
        return true;
      }
    } else if (filePath === entry) {
      return true;
    }
  }
  return false;
}

function inScope(filePath, scope) {
  if (!scope) return true;
  if (scope.endsWith('/')) return filePath.startsWith(scope);
  return filePath === scope;
}

// -----------------------------------------------------------------------------
// Strip comments to reduce false positives. Conservative — comments are common
// in JS, so we strip line comments (`// ...`) and block comments (`/* ... */`)
// before pattern-matching for code rules.
// -----------------------------------------------------------------------------
function stripComments(src) {
  // Remove block comments first.
  let out = src.replace(/\/\*[\s\S]*?\*\//g, '');
  // Remove line comments. Naive but acceptable here — we are not parsing.
  out = out.replace(/(^|[^:\\])\/\/[^\n]*/g, (m, p1) => p1);
  return out;
}

function scanFile(absPath, relPath, rule) {
  let src;
  try {
    src = fs.readFileSync(absPath, 'utf8');
  } catch {
    return null;
  }
  const text = relPath.endsWith('.js') || relPath.endsWith('.mjs') || relPath.endsWith('.cjs')
    ? stripComments(src)
    : src;
  const m = text.match(rule.pattern);
  if (!m) return null;
  // Find the first matching line in the original source for nicer reporting.
  const lines = src.split(/\r?\n/);
  let lineNo = 0;
  for (let i = 0; i < lines.length; i++) {
    if (rule.pattern.test(lines[i])) {
      lineNo = i + 1;
      break;
    }
  }
  return { line: lineNo, snippet: lines[lineNo - 1]?.trim?.() || '' };
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------
const asJson = process.argv.includes('--json');
const allFiles = listFiles(root);
const violations = [];

for (const rule of rules) {
  for (const rel of allFiles) {
    if (!inScope(rel, rule.scope)) continue;
    if (isAllowed(rel, rule.allow)) continue;
    const hit = scanFile(path.join(root, rel), rel, rule);
    if (hit) {
      violations.push({
        intentId: rule.intentId,
        file: rel,
        line: hit.line,
        snippet: hit.snippet,
        description: rule.description
      });
    }
  }
}

if (asJson) {
  process.stdout.write(JSON.stringify({ ok: violations.length === 0, violations }, null, 2));
  process.stdout.write('\n');
} else {
  if (violations.length === 0) {
    console.log('[check-policy] OK — all behavioral policy rules clean.');
    console.log(`[check-policy] Rules checked: ${rules.length} | Files scanned: ${allFiles.length}`);
  } else {
    console.error(`[check-policy] FAILED — ${violations.length} violation(s):\n`);
    for (const v of violations) {
      console.error(`  ${v.intentId}`);
      console.error(`    ${v.file}:${v.line}`);
      console.error(`    > ${v.snippet}`);
      console.error(`    why: ${v.description}`);
      console.error('');
    }
    console.error('See docs/INTENT.md for the matching rule and how to fix.');
  }
}

process.exit(violations.length === 0 ? 0 : 1);
