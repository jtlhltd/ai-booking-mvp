// Timezone-safe business hours using Luxon (avoids Date+toLocaleString parsing bugs on Render).

import { DateTime } from 'luxon';
import { isUkBankHolidayPublic } from './uk-bank-holidays.js';

/** JS getDay-style: 0=Sun … 6=Sat — Mon–Fri outbound dials. */
const JS_WEEKDAYS_MON_FRI = [1, 2, 3, 4, 5];

/** Set ALLOW_OUTBOUND_WEEKEND_CALLS=1 to permit Sat/Sun in tenant `businessHours.days` for outbound dials. */
export function allowOutboundWeekendCalls() {
  const v = String(process.env.ALLOW_OUTBOUND_WEEKEND_CALLS || '').toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

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
 * @param {{ forOutboundDial?: boolean }} [options] — when forOutboundDial, Sat/Sun are excluded unless ALLOW_OUTBOUND_WEEKEND_CALLS is set.
 */
export function isBusinessHoursForTenant(
  tenant,
  when = new Date(),
  fallbackTz = 'Europe/London',
  options = {}
) {
  const tz = getTenantTimezone(tenant, fallbackTz);
  const dt = DateTime.fromJSDate(when instanceof Date ? when : new Date(when), { zone: tz });
  if (!dt.isValid) return false;

  const cfg = getBusinessHoursConfig(tenant);
  let days = Array.isArray(cfg.days) ? cfg.days : [1, 2, 3, 4, 5];
  if (options.forOutboundDial === true && !allowOutboundWeekendCalls()) {
    days = days.filter((d) => JS_WEEKDAYS_MON_FRI.includes(d));
    if (days.length === 0) days = [...JS_WEEKDAYS_MON_FRI];
  }
  const start = cfg.start ?? 9;
  const end = cfg.end ?? 17;

  const jsDay = dt.weekday === 7 ? 0 : dt.weekday;
  const isWeekday = days.includes(jsDay);
  const isHour = dt.hour >= start && dt.hour < end;
  if (isUkBankHolidayPublic(tenant, when instanceof Date ? when : new Date(when), fallbackTz)) {
    return false;
  }
  return isWeekday && isHour;
}

/**
 * Next instant at or after `from` when calls are allowed.
 * Steps in 15-minute increments (max ~2 weeks).
 * @param {{ forOutboundDial?: boolean }} [options] — pass forOutboundDial for outbound dial rules (weekdays-only by default).
 */
export function getNextBusinessOpenForTenant(
  tenant,
  from = new Date(),
  fallbackTz = 'Europe/London',
  options = {}
) {
  const tz = getTenantTimezone(tenant, fallbackTz);
  let dt = DateTime.fromJSDate(from instanceof Date ? from : new Date(from), { zone: tz });
  if (!dt.isValid) dt = DateTime.now().setZone(tz);

  for (let i = 0; i < 24 * 4 * 14; i++) {
    if (isBusinessHoursForTenant(tenant, dt.toJSDate(), fallbackTz, options)) {
      return dt.toJSDate();
    }
    dt = dt.plus({ minutes: 15 });
  }
  return DateTime.now().setZone(tz).plus({ days: 1 }).set({ hour: 9, minute: 0, second: 0, millisecond: 0 }).toJSDate();
}

/**
 * Snap a proposed outbound dial time to the next allowed instant (weekdays + hours + UK bank holidays).
 */
export function clampOutboundDialToAllowedWindow(tenant, when, fallbackTz = 'Europe/London') {
  const d =
    when instanceof Date && !Number.isNaN(when.getTime()) ? when : new Date(when != null ? when : Date.now());
  if (!tenant || allowOutboundWeekendCalls()) return d;
  if (isBusinessHoursForTenant(tenant, d, fallbackTz, { forOutboundDial: true })) return d;
  return getNextBusinessOpenForTenant(tenant, d, fallbackTz, { forOutboundDial: true });
}

function asJson(val, fallback) {
  if (val == null) return fallback;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(String(val));
  } catch {
    return fallback;
  }
}

/** Closed dates as YYYY-MM-DD (same source as calendar booking / signup). */
export function closedDatesSetForTenant(tenant) {
  const arr =
    asJson(tenant?.closedDates, null) ||
    asJson(tenant?.closedDatesJson, null) ||
    asJson(tenant?.booking?.closedDates, null) ||
    [];
  const set = new Set();
  if (!Array.isArray(arr)) return set;
  for (const x of arr) {
    if (typeof x === 'string') set.add(x);
  }
  return set;
}

/**
 * Friday end-of-day of the business week that contains `fail` (Mon–Fri week; Sat/Sun → previous Friday).
 */
function fridayCutoffSameWeek(dt, tz) {
  let fail = dt.setZone(tz);
  if (!fail.isValid) fail = DateTime.now().setZone(tz);
  if (fail.weekday <= 5) {
    return fail.set({ weekday: 5 }).endOf('day');
  }
  return fail.minus({ days: fail.weekday - 5 }).endOf('day');
}

/**
 * One outbound attempt per remaining open weekday through Friday of the same week as `fromWhen`,
 * skipping tenant closed dates and non-working weekdays (businessHours.days).
 * First slot is the day after the failure (not same calendar day).
 */
export function computeSameWeekWeekdayFollowUpSlots(
  tenant,
  fromWhen = new Date(),
  fallbackTz = 'Europe/London',
  { maxSteps = 5 } = {}
) {
  const tz = getTenantTimezone(tenant, fallbackTz);
  const cfg = getBusinessHoursConfig(tenant);
  let allowedDays = Array.isArray(cfg.days) ? cfg.days : [1, 2, 3, 4, 5];
  if (!allowOutboundWeekendCalls()) {
    allowedDays = allowedDays.filter((d) => JS_WEEKDAYS_MON_FRI.includes(d));
    if (allowedDays.length === 0) allowedDays = [...JS_WEEKDAYS_MON_FRI];
  }
  const startHour = cfg.start ?? 9;
  const closed = closedDatesSetForTenant(tenant);

  let fail = DateTime.fromJSDate(fromWhen instanceof Date ? fromWhen : new Date(fromWhen), { zone: tz });
  if (!fail.isValid) fail = DateTime.now().setZone(tz);

  const fridayEnd = fridayCutoffSameWeek(fail, tz);
  const slots = [];

  let d = fail.startOf('day').plus({ days: 1 });
  while (d <= fridayEnd && slots.length < maxSteps) {
    const jsD = d.weekday === 7 ? 0 : d.weekday;
    const ymd = d.toFormat('yyyy-LL-dd');
    const isClosed = closed.has(ymd);
    const isUkClosed = isUkBankHolidayPublic(tenant, d.toJSDate(), fallbackTz);
    const isAllowedDow = allowedDays.includes(jsD);

    if (isAllowedDow && !isClosed && !isUkClosed) {
      slots.push(
        d.set({ hour: startHour, minute: 0, second: 0, millisecond: 0 }).toJSDate()
      );
    }
    d = d.plus({ days: 1 });
  }

  return slots;
}
