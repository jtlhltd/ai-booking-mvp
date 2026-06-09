/**
 * Config-driven remediation for known failure kinds (see config/remediation-rules.json).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RULES_PATH = join(__dirname, '..', 'config', 'remediation-rules.json');

let cachedRules = null;

export function loadRemediationRules() {
  if (cachedRules) return cachedRules;
  try {
    cachedRules = JSON.parse(readFileSync(RULES_PATH, 'utf8'));
  } catch (e) {
    console.warn('[REMEDIATION] Failed to load rules:', e?.message || e);
    cachedRules = { version: 1, rules: {} };
  }
  return cachedRules;
}

export function clearRemediationRulesCache() {
  cachedRules = null;
}

export function matchRemediationRule(failureKind, errorType) {
  const { rules } = loadRemediationRules();
  const bucket = rules?.[failureKind];
  if (!bucket || typeof bucket !== 'object') return null;
  const key = String(errorType || '*').trim().toLowerCase();
  return bucket[key] || bucket['*'] || null;
}

/**
 * Run configured remediation actions. Handlers are injected by the caller.
 *
 * @param {string} failureKind e.g. vapi_call_failure
 * @param {string} errorType from categorizeError
 * @param {object} ctx must include `handlers` map of action name → async fn
 */
export async function executeRemediation(failureKind, errorType, ctx = {}) {
  const rule = matchRemediationRule(failureKind, errorType);
  if (!rule) {
    return { ok: false, reason: 'no_rule', failureKind, errorType };
  }

  const handlers = ctx.handlers || {};
  const actions = Array.isArray(rule.actions) ? rule.actions : [];
  const results = [];

  for (const action of actions) {
    const fn = handlers[action];
    if (typeof fn !== 'function') {
      results.push({ action, ok: false, reason: 'handler_missing' });
      continue;
    }
    try {
      await fn({ ...ctx, rule, errorType, failureKind });
      results.push({ action, ok: true });
    } catch (e) {
      results.push({ action, ok: false, reason: e?.message || String(e) });
    }
  }

  return {
    ok: results.every((r) => r.ok),
    failureKind,
    errorType,
    rule,
    results,
  };
}
