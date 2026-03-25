// Timezone-safe business hours using Luxon (avoids Date+toLocaleString parsing bugs on Render).

import { DateTime } from 'luxon';

export function getTenantTimezone(tenant, fallback = 'Europe/London') {
  if (!tenant) return fallback;
  return tenant.booking?.timezone || tenant.timezone || fallback;
}

export function getBusinessHoursConfig(tenant) {
  return tenant?.businessHours || {
    start: 9,
    end: 17,
    days: [1, 2, 3, 4, 5]
  };
}

/**
 * @param {object|null} tenant - getFullClient row or similar (optional)
 * @param {Date} [when]
 * @param {string} [fallbackTz] - IANA zone when tenant has no timezone
 *
 * `businessHours.days` uses the same convention as Date.getDay(): 0=Sun .. 6=Sat
 */
export function isBusinessHoursForTenant(tenant, when = new Date(), fallbackTz = 'Europe/London') {
  const tz = getTenantTimezone(tenant, fallbackTz);
  const dt = DateTime.fromJSDate(when instanceof Date ? when : new Date(when), { zone: tz });
  if (!dt.isValid) return false;

  const cfg = getBusinessHoursConfig(tenant);
  const days = Array.isArray(cfg.days) ? cfg.days : [1, 2, 3, 4, 5];
  const start = cfg.start ?? 9;
  const end = cfg.end ?? 17;

  const jsDay = dt.weekday === 7 ? 0 : dt.weekday;
  const isWeekday = days.includes(jsDay);
  const isHour = dt.hour >= start && dt.hour < end;
  return isWeekday && isHour;
}

/**
 * Next instant at or after `from` when calls are allowed.
 * Steps in 15-minute increments (max ~2 weeks).
 */
export function getNextBusinessOpenForTenant(tenant, from = new Date(), fallbackTz = 'Europe/London') {
  const tz = getTenantTimezone(tenant, fallbackTz);
  let dt = DateTime.fromJSDate(from instanceof Date ? from : new Date(from), { zone: tz });
  if (!dt.isValid) dt = DateTime.now().setZone(tz);

  for (let i = 0; i < 24 * 4 * 14; i++) {
    if (isBusinessHoursForTenant(tenant, dt.toJSDate(), fallbackTz)) {
      return dt.toJSDate();
    }
    dt = dt.plus({ minutes: 15 });
  }
  return DateTime.now().setZone(tz).plus({ days: 1 }).set({ hour: 9, minute: 0, second: 0, millisecond: 0 }).toJSDate();
}
