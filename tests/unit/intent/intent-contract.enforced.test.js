import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

function repoRoot() {
  return path.resolve(process.cwd());
}

function readText(relPath) {
  return fs.readFileSync(path.join(repoRoot(), relPath), 'utf8');
}

function listFilesRec(dirRel, acc = []) {
  const abs = path.join(repoRoot(), dirRel);
  for (const ent of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = `${dirRel}/${ent.name}`.replace(/\\/g, '/');
    if (ent.isDirectory()) listFilesRec(rel, acc);
    else if (ent.isFile()) acc.push(rel);
  }
  return acc;
}

function extractIntentIdsFromIntentMd(md) {
  // IDs are always backticked in the tables: `dial.imports-distribute-not-burst`
  const out = new Set();
  const re = /`([a-z][a-z0-9-]*\.[a-z0-9-]+)`/g;
  let m;
  while ((m = re.exec(md))) out.add(m[1]);
  return [...out].sort();
}

function extractIntentIdsFromSource(source) {
  const out = new Set();
  const re = /intentId:\s*['"`]([^'"`]+)['"`]/g;
  let m;
  while ((m = re.exec(source))) out.add(m[1]);
  return out;
}

describe('docs/INTENT.md is continuously enforced', () => {
  test('every Intent Contract ID has at least one enforcement (policy/canary/invariant)', () => {
    const intentMd = readText('docs/INTENT.md');
    const ids = extractIntentIdsFromIntentMd(intentMd);
    expect(ids.length).toBeGreaterThan(0);

    const policyIds = extractIntentIdsFromSource(readText('scripts/check-policy.mjs'));
    const invariantIds = extractIntentIdsFromSource(readText('lib/ops-invariants.js'));

    const canaryFiles = listFilesRec('tests/canaries');
    const canaryText = canaryFiles.map((f) => readText(f)).join('\n');

    // Some intent IDs are enforced by route-level contract tests under
    // tests/routes/ rather than dedicated canaries. We pick those up by
    // scanning for `intent: <id>` comment tags so the enforcement footprint
    // does not duplicate large existing test suites.
    const routeFiles = listFilesRec('tests/routes').filter((f) => f.endsWith('.test.js'));
    const routeText = routeFiles.map((f) => readText(f)).join('\n');
    const routeTagRe = /intent:\s*([a-z][a-z0-9-]*\.[a-z0-9-]+)/g;
    const routeTaggedIds = new Set();
    {
      let m;
      while ((m = routeTagRe.exec(routeText))) routeTaggedIds.add(m[1]);
    }

    // Contract checklist enforcement: these intents are enforced by the shared
    // contract asserts + widespread route contract tests, even if no dedicated
    // canary mentions the intentId.
    const contractAsserts = readText('tests/helpers/contract-asserts.js');
    const contractEnforced = new Map([
      ['tenant.auth-required-on-admin', contractAsserts.includes('export async function assertAuthRequired')],
      ['tenant.cross-tenant-isolation', contractAsserts.includes('export async function assertTenantIsolation')],
      ['error.json-envelope', contractAsserts.includes('export function assertJsonErrorEnvelope')],
      ['error.cache-control-no-store', contractAsserts.includes('export function assertNoStoreCache')]
    ]);

    // Allow-list for intents that genuinely cannot be enforced without deeper
    // integration test hooks. Empty by design — every new intent must come
    // with a policy / canary / invariant / route-test gate. Keep it that way.
    const allowedManual = new Set([]);

    const missing = [];
    for (const id of ids) {
      if (allowedManual.has(id)) continue;
      const hasPolicy = policyIds.has(id);
      const hasInvariant = invariantIds.has(id);
      const hasCanary = canaryText.includes(id);
      const hasContract = contractEnforced.get(id) === true;
      const hasRouteTag = routeTaggedIds.has(id);
      if (!hasPolicy && !hasInvariant && !hasCanary && !hasContract && !hasRouteTag) missing.push(id);
    }

    // If this fails, either:
    // - add a canary mentioning the intentId in describe(), or
    // - add a policy rule in scripts/check-policy.mjs, or
    // - add a runtime invariant / summary row in lib/ops-invariants.js, or
    // - add `intent: <id>` to a relevant tests/routes/*.contract.test.js
    expect(missing).toEqual([]);
  });
});

