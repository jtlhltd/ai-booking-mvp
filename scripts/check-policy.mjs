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
// Rule shape:
//   { intentId, description, scope?, allow?, mode? }
//
// Two modes are supported:
//
// 1. `mode: 'forbid'` (default) — file VIOLATES if `pattern` matches.
//    `pattern`        — regex applied per-file (multiline).
//
// 2. `mode: 'require'` — file VIOLATES if its name matches `filePattern` but
//    NONE of the regexes in `requireAny` match its content. Use this for
//    "every new webhook route under routes/ must import the verifier" rules.
//    `filePattern`    — regex applied to file PATH (decides which files are
//                       checked under `scope`).
//    `requireAny`     — array of regexes; file MUST match at least one. If
//                       none match, that's a violation.
//
// Common fields:
//   `allow`   — list of file paths or directory prefixes (POSIX-style,
//               repo-relative). A file is allow-listed when its path equals
//               an entry, or starts with any directory entry (must end '/').
//   `scope`   — optional directory prefix (POSIX-style, ending '/'). When
//               set, only files under this prefix are checked.
//   `intentId` — anchor in docs/INTENT.md.
// -----------------------------------------------------------------------------
const rules = [
  {
    intentId: 'ops.server-boot-wiring-no-tdz',
    description:
      'server.js must not TDZ-crash at boot by passing undeclared consts into mountApi(...). Ensure key wiring constants are defined before the mountApi(app, {...}) call.',
    scope: 'server.js',
    // Violation if mountApi(app, ...) appears before these const initializations.
    // This matches the historical failure class:
    //   ReferenceError: Cannot access '<name>' before initialization
    pattern: /mountApi\s*\(\s*app\s*,[\s\S]*?\bconst\s+(?:DASHBOARD_ACTIVITY_TZ|TWILIO_ACCOUNT_SID|TWILIO_AUTH_TOKEN|TWILIO_FROM_NUMBER|TWILIO_MESSAGING_SERVICE_SID|defaultSmsClient)\b/,
    allow: []
  },
  {
    intentId: 'billing.wallet-check-keeps-queue-pending',
    description:
      'Queue worker must treat vapi_wallet_depleted as a defer/pending (no synthetic failed_q call rows). The outbound queue worker module must import the shared classifier from lib/vapi-queue-result.js and call isTransientVapiQueueResult.',
    mode: 'require',
    scope: 'lib/',
    filePattern: /^lib\/server-queue-workers\.js$/,
    requireAny: [
      /from\s+['"`]\.\/vapi-queue-result\.js['"`]/,
      /\bisTransientVapiQueueResult\b/
    ],
    allow: []
  },
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
      'schedule-prospect-calls.js',
      // Tests + docs should not contain direct Vapi POST call sites; keep the
      // allow-list tight so any new direct dialer is caught immediately.
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
      'e2e/',
      'scripts/',
      'demos/',
      // Seed / migration SQL references the anchor tenant key (not customer-facing).
      'db/migrations/seed-tom-outbound-sequence.js',
      // Public dashboard HTML only references the slug in comments and
      // an explicit "DEMO_DATA must NOT load for d2d-xpress-tom" guard.
      'public/client-dashboard.html',
      // Code comments / fallback constants — these do not appear in payloads.
      'server.js',
      'lib/instant-calling.js',
      // Dashboard self-service default allow-list keys (same surface as former server.js inline).
      'lib/outbound-ab-dashboard-handlers.js',
      // URL/API spelling variants for the same anchor tenant row (not customer-facing copy).
      'lib/client-key-lookup.js'
    ]
  },
  {
    intentId: 'tenant.dashboard-client-key-spelling',
    description:
      'lib/client-key-lookup.js must export getClientKeyLookupCandidates and keep both Tom spelling literals paired for mutual DB lookup.',
    mode: 'require',
    scope: 'lib/',
    filePattern: /^lib\/client-key-lookup\.js$/,
    requireAny: [
      /(?=.*\bexport function getClientKeyLookupCandidates\b)(?=.*u2d-xpress-tom)(?=.*d2d-xpress-tom)/s
    ],
    allow: []
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
      'lib/instant-calling.js',
      // Env-driven dashboard default keys list (not a Vapi dial payload).
      'lib/outbound-ab-dashboard-handlers.js',
      'lib/client-key-lookup.js'
    ]
  },
  {
    intentId: 'webhook.signature-required',
    description:
      'Any route file handling Vapi webhooks must import verifyVapiSignature from middleware/vapi-webhook-verification.js, and any Twilio voice webhook route must call twilio.validateRequest. New webhook routes that skip signature verification are forbidden.',
    mode: 'require',
    scope: 'routes/',
    // Vapi webhook routes (vapi-webhooks.js, vapi-webhooks-mount.js, ...) and
    // Twilio voice webhooks (twilio-voice-webhooks.js, twilio-webhooks.js, ...).
    filePattern: /^routes\/(vapi-webhooks?|twilio[-_a-z0-9]*-webhooks?|twilio[-_a-z0-9]*-voice|twilio-voice-webhooks?)[-_a-z0-9]*\.js$/,
    requireAny: [
      /verifyVapiSignature/,
      /vapi-webhook-verification/,
      /twilio\.validateRequest/,
      /validateTwilioRequest/,
      /twilioWebhookVerification/,
      /X-Twilio-Signature/i
    ],
    allow: []
  },
  {
    intentId: 'ops.server-helpers-no-new-vapi-call-sites',
    description:
      'Extracted server helpers (`lib/server-call-resilience.js`, `lib/server-assistant-scheduling.js`) keep module boundaries: resilience uses dynamic `import("../db.js")` for budget/retry queue; scheduling imports `./business-hours.js`. Direct Vapi dial POSTs remain forbidden outside allow-listed worker modules.',
    mode: 'require',
    scope: 'lib/',
    filePattern: /^lib\/(server-call-resilience|server-assistant-scheduling)\.js$/,
    requireAny: [
      /import\s*\(\s*['"`]\.\.\/db\.js['"`]\s*\)/,
      /from\s+['"`]\.\/business-hours\.js['"`]/
    ],
    allow: []
  },
  {
    intentId: 'queue.retry-backlog-bounded',
    description:
      'Retry queue failures must reschedule scheduled_for with backoff; do not reintroduce "pending + attempt++" without moving the timestamp forward.',
    // This exact pattern caused retries to stay due-now, creating an ever-growing backlog
    // that trips lib/ops-invariants.js#retryDue and can amplify spend.
    pattern: /updateRetryStatus\s*\(\s*[^,]+,\s*['"`]pending['"`]\s*,\s*[^)]+\+\s*1\s*\)/,
    allow: ['tests/', 'docs/']
  },
  {
    intentId: 'sequence.lead-sequence-state-sql-contained',
    description:
      'Mutations to lead_sequence_state must stay in the domain module, queue worker, webhook handler, or migrations — not random routes.',
    pattern: /\b(INTO|UPDATE)\s+lead_sequence_state\b/i,
    allow: [
      'db/domains/lead-sequence-state.js',
      'db/migrations/postgres-core-schema.js',
      'db/migrations/sqlite-core-schema.js',
      'lib/server-queue-workers.js',
      'tests/',
      'docs/INTENT.md'
    ]
  },
  {
    intentId: 'sequence.outbound-sequence-json-contained',
    description:
      'The tenants JSON column for outbound sequences (see INTENT domain: sequence) must not sprawl into arbitrary lib/ files; keep writes in migrations + db facade + docs.',
    pattern: /\boutbound_sequence_json\b/,
    allow: [
      'db/migrations/',
      'db.js',
      'docs/INTENT.md',
      'lib/outbound-sequence.js',
      'lib/ops-invariants.js',
      'scripts/check-policy.mjs',
      'tests/'
    ]
  },
  {
    intentId: 'dial.lead-dial-context-contained',
    description:
      'leads.lead_dial_context_json must not sprawl into routes or random lib until explicitly allow-listed (migrations, lead-dial-context helper, queue worker, sequence handoff webhook, tests, docs).',
    pattern: /\blead_dial_context_json\b/,
    allow: [
      'db/migrations/postgres-core-schema.js',
      'db/migrations/sqlite-core-schema.js',
      'lib/lead-dial-context.js',
      'lib/lead-import.js',
      'lib/leads-import.js',
      'lib/server-queue-workers.js',
      'lib/vapi-webhooks/outbound-sequence-webhook.js',
      'db.js',
      'docs/INTENT.md',
      'docs/plans/',
      'scripts/check-policy.mjs',
      'tests/'
    ]
  },
  {
    intentId: 'queue.worker-imports-scheduling-and-resilience',
    description:
      'lib/server-queue-workers.js must statically import selectOptimalAssistant from ./server-assistant-scheduling.js and categorizeError from ./server-call-resilience.js when referenced, so cron/dial paths never throw ReferenceError at runtime.',
    mode: 'require',
    scope: 'lib/',
    filePattern: /^lib\/server-queue-workers\.js$/,
    requireAny: [
      /(?=.*\bimport\s*\{[^}]*\bcategorizeError\b[^}]*\}\s*from\s*['"]\.\/server-call-resilience\.js['"])(?=.*\bimport\s*\{[^}]*\bselectOptimalAssistant\b[^}]*\}\s*from\s*['"]\.\/server-assistant-scheduling\.js['"])/s
    ],
    allow: []
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
  const isJs = relPath.endsWith('.js') || relPath.endsWith('.mjs') || relPath.endsWith('.cjs');
  const text = isJs ? stripComments(src) : src;
  const lines = src.split(/\r?\n/);

  // require-mode: the file's filename must match `filePattern` AND the file
  // body must match at least one of `requireAny`. Otherwise: violation.
  if (rule.mode === 'require') {
    if (rule.filePattern && !rule.filePattern.test(relPath)) return null;
    const required = rule.requireAny || [];
    if (required.length === 0) return null;
    const hit = required.some((re) => re.test(text));
    if (hit) return null;
    return {
      line: 1,
      snippet: lines[0]?.trim?.() || '(missing required pattern)'
    };
  }

  // Default forbid-mode: a match in the file is a violation.
  if (!rule.pattern) return null;
  const m = text.match(rule.pattern);
  if (!m) return null;
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
