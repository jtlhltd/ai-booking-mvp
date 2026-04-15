import { DateTime } from 'luxon';
import * as chrono from 'chrono-node';

/** Parses a natural-language start time preference into a Date in the given IANA timezone. */
export function parseStartPreference(preference, timeZone) {
  if (!preference || typeof preference !== 'string' || !timeZone) return null;
  try {
    const reference = DateTime.now().setZone(timeZone);
    const parsedResults = chrono.parse(preference, reference.toJSDate(), {
      forwardDate: true
    });
    const first = parsedResults[0];
    const parsedDate =
      first?.start?.date?.() ??
      chrono.parseDate(preference, reference.toJSDate(), { forwardDate: true });
    if (!parsedDate) return null;
    let dt = DateTime.fromJSDate(parsedDate, { zone: timeZone }).setZone(timeZone);
    if (Number.isNaN(dt.valueOf()) || !dt.isValid) return null;
    dt = dt.set({ second: 0, millisecond: 0 });
    if (!first?.start?.isCertain('hour')) {
      dt = dt.set({ hour: 14, minute: 0 });
    }
    if (!first?.start?.isCertain('minute')) {
      dt = dt.set({ minute: dt.minute || 0 });
    }
    if (dt <= reference) {
      dt = dt.plus({ days: 1 });
    }
    return dt.toJSDate();
  } catch (err) {
    console.error('[startPref.parse.error]', err);
    return null;
  }
}
