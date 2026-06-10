/** Shared dedupe for Sentry self-heal → Cursor webhook (poller + relay + concurrent ticks). */

const DEFAULT_COOLDOWN_MS = 4 * 60 * 60 * 1000;
const triggeredAt = new Map();
const inFlight = new Set();

function normalizeIssueId(issueId) {
  return String(issueId || '').trim().toUpperCase();
}

function cooldownMs() {
  const raw = process.env.SENTRY_SELF_HEAL_TRIGGER_COOLDOWN_MS;
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

export function selfHealTriggerCooldownRemaining(issueId) {
  const id = normalizeIssueId(issueId);
  if (!id) return 0;
  pruneExpired();
  const at = triggeredAt.get(id);
  if (at == null) return 0;
  const remaining = cooldownMs() - (Date.now() - at);
  return remaining > 0 ? remaining : 0;
}

export function shouldDedupeSelfHealTrigger(issueId, options = {}) {
  if (options.force) return { dedupe: false };
  const id = normalizeIssueId(issueId);
  if (!id) return { dedupe: false };
  if (inFlight.has(id)) {
    return { dedupe: true, reason: 'in_flight' };
  }
  const remaining = selfHealTriggerCooldownRemaining(id);
  if (remaining > 0) {
    return { dedupe: true, reason: 'cooldown', remainingMs: remaining };
  }
  return { dedupe: false };
}

export function beginSelfHealTrigger(issueId) {
  const id = normalizeIssueId(issueId);
  if (!id || inFlight.has(id)) return false;
  inFlight.add(id);
  return true;
}

export function completeSelfHealTrigger(issueId, { succeeded = true } = {}) {
  const id = normalizeIssueId(issueId);
  if (!id) return;
  inFlight.delete(id);
  if (succeeded) {
    triggeredAt.set(id, Date.now());
    pruneExpired();
  }
}

/** Test helper */
export function resetSelfHealTriggerDedupeForTests() {
  triggeredAt.clear();
  inFlight.clear();
}
