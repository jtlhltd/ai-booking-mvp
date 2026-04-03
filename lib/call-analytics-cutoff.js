// Optional floor for call-time bandit + call insights: ignore calls before this instant (e.g. test traffic).
// Set CALL_ANALYTICS_SINCE to ISO 8601 (e.g. 2026-04-03T12:00:00.000Z or 2026-04-03).

import { DateTime } from 'luxon';

/**
 * @returns {string|null} UTC ISO timestamp for SQL comparisons, or null if unset/invalid
 */
export function getCallAnalyticsMinCreatedAtIso() {
  const raw = (process.env.CALL_ANALYTICS_SINCE || '').trim();
  if (!raw) return null;
  const dt = DateTime.fromISO(raw, { setZone: true });
  if (!dt.isValid) {
    console.warn('[CALL_ANALYTICS_SINCE] invalid ISO, ignoring:', raw);
    return null;
  }
  return dt.toUTC().toISO();
}

/**
 * @returns {import('luxon').DateTime | null} UTC
 */
export function getCallAnalyticsMinCreatedAtLuxonUtc() {
  const iso = getCallAnalyticsMinCreatedAtIso();
  return iso ? DateTime.fromISO(iso, { zone: 'utc' }) : null;
}
