import {
  isBusinessHoursForTenant,
  getNextBusinessOpenForTenant,
} from './business-hours.js';
import { resolveTenantTimezone } from './timezone-resolver.js';

export const TIMEZONE = process.env.TZ || process.env.TIMEZONE || 'Europe/London';

export function isBusinessHours(tenant = null) {
  const tz = tenant?.booking?.timezone || tenant?.timezone || TIMEZONE;
  return isBusinessHoursForTenant(tenant, new Date(), tz, { forOutboundDial: true });
}

export function getNextBusinessHour(tenant = null) {
  const tz = tenant?.booking?.timezone || tenant?.timezone || TIMEZONE;
  return getNextBusinessOpenForTenant(tenant, new Date(), tz, { forOutboundDial: true });
}

export function pickTimezone(client) {
  return resolveTenantTimezone(client, TIMEZONE);
}
