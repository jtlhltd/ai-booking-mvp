import { DateTime } from 'luxon';

const DEFAULT_TZ = 'Europe/London';

function cleanTimezone(value) {
  if (value == null) return '';
  const tz = String(value).trim();
  if (!tz) return '';
  return tz;
}

/**
 * Canonical tenant timezone precedence:
 * booking.timezone -> timezone -> whiteLabel.timezone -> env -> default.
 */
export function resolveTenantTimezone(tenant, envFallback = process.env.TZ || process.env.TIMEZONE || DEFAULT_TZ) {
  const picked =
    cleanTimezone(tenant?.booking?.timezone) ||
    cleanTimezone(tenant?.timezone) ||
    cleanTimezone(tenant?.whiteLabel?.timezone) ||
    cleanTimezone(tenant?.whiteLabel?.booking?.timezone) ||
    cleanTimezone(envFallback) ||
    DEFAULT_TZ;
  return picked;
}

export function toUtcIso(value) {
  if (value == null) return '';
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

export function toLocalTimestamp(value, timezone, format = "yyyy-LL-dd HH:mm:ss ZZZZ") {
  if (value == null) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const dt = DateTime.fromJSDate(d, { zone: timezone || DEFAULT_TZ });
  return dt.isValid ? dt.toFormat(format) : '';
}
