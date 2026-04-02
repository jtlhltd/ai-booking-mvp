// UK bank / public holidays for outbound calling (no dial on these days).
// Uses date-holidays with Gov.uk-aligned rules: England & Wales (ENG), Northern Ireland (NIR).

import Holidays from 'date-holidays';
import { DateTime } from 'luxon';

const hdEng = new Holidays('GB', 'ENG');
const hdNir = new Holidays('GB', 'NIR');

/**
 * @param {'ENG'|'NIR'|null} subdiv
 * @returns {import('date-holidays').default | null}
 */
function holidaysFor(subdiv) {
  if (subdiv === 'NIR') return hdNir;
  if (subdiv === 'ENG') return hdEng;
  return null;
}

/**
 * Map tenant timezone to UK bank holiday calendar (England & Wales, or NI).
 * Non-UK zones → null (no UK bank holiday blocking).
 */
export function ukBankHolidaySubdivForTenant(tenant, fallbackTz = 'Europe/London') {
  const tz = tenant?.booking?.timezone || tenant?.timezone || fallbackTz;
  if (tz === 'Europe/Belfast') return 'NIR';
  if (tz === 'Europe/London') return 'ENG';
  return null;
}

/**
 * True if `when` (any zone) falls on a UK public/bank holiday in the relevant calendar.
 */
export function isUkBankHolidayPublic(tenant, when = new Date(), fallbackTz = 'Europe/London') {
  const subdiv = ukBankHolidaySubdivForTenant(tenant, fallbackTz);
  const hd = holidaysFor(subdiv);
  if (!hd) return false;

  const dt = DateTime.fromJSDate(when instanceof Date ? when : new Date(when), {
    zone: subdiv === 'NIR' ? 'Europe/Belfast' : 'Europe/London'
  });
  if (!dt.isValid) return false;

  const noonLocal = dt.set({ hour: 12, minute: 0, second: 0, millisecond: 0 });
  const res = hd.isHoliday(noonLocal.toJSDate());
  if (!Array.isArray(res)) return false;
  return res.some((h) => h.type === 'public');
}
