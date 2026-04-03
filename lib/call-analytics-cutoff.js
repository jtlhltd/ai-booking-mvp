// Default: analytics / bandit use only calls on or after the persisted floor (see getCallAnalyticsFloorIso in db.js).
// Optional override — fixed ISO instant (ignores persisted floor):
//   CALL_ANALYTICS_SINCE=2026-04-03T00:00:00.000Z

import { DateTime } from 'luxon';

/**
 * @returns {string|null} UTC ISO when env override is set and valid
 */
export function getCallAnalyticsEnvOverrideIso() {
  const raw = (process.env.CALL_ANALYTICS_SINCE || '').trim();
  if (!raw) return null;
  const dt = DateTime.fromISO(raw, { setZone: true });
  if (!dt.isValid) {
    console.warn('[CALL_ANALYTICS_SINCE] invalid ISO, ignoring:', raw);
    return null;
  }
  return dt.toUTC().toISO();
}
