/**
 * Calendar find-slots handler extracted from `server.js` so it can be tested
 * without pulling the full server file into Jest coverage.
 */
import { DateTime } from 'luxon';

export async function handleCalendarFindSlots(req, res, deps) {
  try {
    const {
      getClientFromHeader,
      pickTimezone,
      pickCalendarId,
      servicesFor,
      getGoogleCredentials,
      makeJwtAuth,
      freeBusy,
      now = () => Date.now(),
    } = deps || {};

    const client = await getClientFromHeader?.(req);
    if (!client) return res.status(400).json({ ok: false, error: 'Unknown tenant (missing X-Client-Key)' });

    const creds = getGoogleCredentials?.() || {};
    if (!(creds.clientEmail && (creds.privateKey || creds.privateKeyB64))) {
      return res.status(400).json({ ok: false, error: 'Google env missing' });
    }

    const tz = pickTimezone?.(client);
    const calendarId = pickCalendarId?.(client);

    const asJson = (val, fallback) => {
      if (val == null) return fallback;
      if (typeof val === 'object') return val;
      try {
        return JSON.parse(String(val));
      } catch {
        return fallback;
      }
    };

    const hoursFor = (c) =>
      asJson(c?.booking?.hours, null) ||
      asJson(c?.hoursJson, null) || {
        mon: ['09:00-17:00'],
        tue: ['09:00-17:00'],
        wed: ['09:00-17:00'],
        thu: ['09:00-17:00'],
        fri: ['09:00-17:00'],
      };
    const closedDatesFor = (c) => asJson(c?.closedDates, []) || asJson(c?.closedDatesJson, []);

    const services =
      typeof servicesFor === 'function'
        ? servicesFor(client)
        : asJson(client?.services, []) || asJson(client?.servicesJson, []);

    const requestedService = req.body?.service;
    const svc = Array.isArray(services) ? services.find((s) => s.id === requestedService) : null;
    const durationMin = svc?.durationMin || req.body?.durationMin || client?.booking?.defaultDurationMin || 30;
    const bufferMin = svc?.bufferMin || 0;

    const minNoticeMin = client?.booking?.minNoticeMin ?? client?.minNoticeMin ?? 0;
    const maxAdvanceDays = client?.booking?.maxAdvanceDays ?? client?.maxAdvanceDays ?? 14;
    const business = hoursFor(client);
    const closedDates = new Set(closedDatesFor(client));
    const stepMinutes = Math.max(5, Number(req.body?.stepMinutes ?? svc?.slotStepMin ?? durationMin ?? 15));

    const windowStart = new Date(now() + minNoticeMin * 60_000);
    const windowEnd = new Date(now() + maxAdvanceDays * 86_400_000);

    function alignToGrid(d) {
      const dt = new Date(d);
      dt.setSeconds(0, 0);
      const minutes = dt.getMinutes();
      const rem = minutes % stepMinutes;
      if (rem !== 0) dt.setMinutes(minutes + (stepMinutes - rem));
      return dt;
    }

    const auth = makeJwtAuth?.({
      clientEmail: creds.clientEmail,
      privateKey: creds.privateKey,
      privateKeyB64: creds.privateKeyB64,
    });
    await auth?.authorize?.();
    const busy = await freeBusy?.({
      auth,
      calendarId,
      timeMinISO: windowStart.toISOString(),
      timeMaxISO: windowEnd.toISOString(),
    });

    const slotMs = (durationMin + bufferMin) * 60_000;
    const results = [];
    let cursor = alignToGrid(windowStart);
    cursor.setSeconds(0, 0);

    const dowName = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

    function formatHMLocal(dt) {
      const f = new Intl.DateTimeFormat('en-GB', {
        timeZone: tz,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      const parts = f.formatToParts(dt);
      const hh = parts.find((p) => p.type === 'hour')?.value ?? '00';
      const mm = parts.find((p) => p.type === 'minute')?.value ?? '00';
      return `${hh}:${mm}`;
    }

    function isOpen(dt) {
      const local = DateTime.fromJSDate(dt, { zone: tz });
      const jsDay = local.weekday === 7 ? 0 : local.weekday;
      const spans = business[dowName[jsDay]];
      if (!Array.isArray(spans) || spans.length === 0) return false;
      const hm = formatHMLocal(dt);
      return spans.some((s) => {
        const [a, b] = String(s).split('-');
        return hm >= a && hm < b;
      });
    }

    function isClosedDate(dt) {
      const f = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      const [y, m, d] = f.format(dt).split('-');
      return closedDates.has(`${y}-${m}-${d}`);
    }

    function overlapsBusy(sISO, eISO) {
      const arr = Array.isArray(busy) ? busy : [];
      return arr.some((b) => !(eISO <= b.start || sISO >= b.end));
    }

    while (cursor < windowEnd && results.length < 30) {
      const start = new Date(cursor);
      const end = new Date(cursor.getTime() + slotMs);
      const sISO = start.toISOString();
      const eISO = end.toISOString();

      if (!isClosedDate(start) && isOpen(start) && !overlapsBusy(sISO, eISO)) {
        results.push({ start: sISO, end: eISO, timezone: tz });
      }

      cursor.setMinutes(cursor.getMinutes() + stepMinutes);
      cursor.setSeconds(0, 0);
    }

    return res.json({ ok: true, slots: results, params: { durationMin, bufferMin, stepMinutes } });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
}

