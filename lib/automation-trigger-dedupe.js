/** Shared dedupe for Cursor automation webhooks (poller + relay + concurrent calls). */

const DEFAULT_COOLDOWN_MS = 4 * 60 * 60 * 1000;
const triggeredAt = new Map();
const inFlight = new Set();

function dedupeKey(namespace, id) {
  const ns = String(namespace || 'default').trim().toLowerCase();
  const key = String(id || '').trim();
  if (!key) return '';
  return `${ns}:${key}`;
}

function cooldownMs() {
  const raw = process.env.SENTRY_SELF_HEAL_TRIGGER_COOLDOWN_MS || process.env.AUTOMATION_TRIGGER_COOLDOWN_MS;
  if (raw == null || raw === '') return DEFAULT_COOLDOWN_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_COOLDOWN_MS;
}

function pruneExpired() {
  const ms = cooldownMs();
  const now = Date.now();
  for (const [id, at] of triggeredAt) {
    if (now - at >= ms) triggeredAt.delete(id);
  }
}

export function automationTriggerCooldownRemaining(namespace, id) {
  const key = dedupeKey(namespace, id);
  if (!key) return 0;
  pruneExpired();
  const at = triggeredAt.get(key);
  if (at == null) return 0;
  const remaining = cooldownMs() - (Date.now() - at);
  return remaining > 0 ? remaining : 0;
}

export function shouldDedupeAutomationTrigger(namespace, id, options = {}) {
  if (options.force) return { dedupe: false };
  const key = dedupeKey(namespace, id);
  if (!key) return { dedupe: false };
  if (inFlight.has(key)) {
    return { dedupe: true, reason: 'in_flight' };
  }
  const remaining = automationTriggerCooldownRemaining(namespace, id);
  if (remaining > 0) {
    return { dedupe: true, reason: 'cooldown', remainingMs: remaining };
  }
  return { dedupe: false };
}

export function beginAutomationTrigger(namespace, id) {
  const key = dedupeKey(namespace, id);
  if (!key || inFlight.has(key)) return false;
  inFlight.add(key);
  return true;
}

export function completeAutomationTrigger(namespace, id, { succeeded = true } = {}) {
  const key = dedupeKey(namespace, id);
  if (!key) return;
  inFlight.delete(key);
  if (succeeded) {
    triggeredAt.set(key, Date.now());
    pruneExpired();
  }
}

/** Test helper */
export function resetAutomationTriggerDedupeForTests() {
  triggeredAt.clear();
  inFlight.clear();
}
