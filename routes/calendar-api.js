/**
 * Calendar API endpoints.
 * Mounted at /api/calendar.
 */
import { Router } from 'express';
import { handleCalendarFindSlots } from '../lib/calendar-find-slots.js';
import { handleCalendarBookSlot } from '../lib/calendar-book-slot.js';
import { handleCalendarCheckBook } from '../lib/calendar-check-book.js';

/**
 * @param {{
 *  getClientFromHeader: (req: any) => Promise<any>,
 *  makeJwtAuth: (opts: any) => any,
 *  GOOGLE_CLIENT_EMAIL: string,
 *  GOOGLE_PRIVATE_KEY?: string,
 *  GOOGLE_PRIVATE_KEY_B64?: string,
 *  google: any,
 *  pickCalendarId: (client: any) => string,
 *  insertEvent: (opts: any) => Promise<any>,
 *  pickTimezone: (client: any) => string,
 *  smsConfig: (client: any) => { messagingServiceSid?: string, fromNumber?: string, smsClient: any, configured: boolean }
 * }} deps
 */
export function createCalendarApiRouter(deps) {
  const {
    getClientFromHeader,
    makeJwtAuth,
    GOOGLE_CLIENT_EMAIL,
    GOOGLE_PRIVATE_KEY,
    GOOGLE_PRIVATE_KEY_B64,
    google,
    pickCalendarId,
    insertEvent,
    pickTimezone,
    smsConfig
  } = deps || {};

  const router = Router();

  // Extracted endpoints that still live under /api/calendar/*
  router.post('/find-slots', (req, res) => handleCalendarFindSlots(req, res, deps));
  router.post('/book-slot', (req, res) => handleCalendarBookSlot(req, res, deps));
  router.post('/check-book', (req, res) => handleCalendarCheckBook(req, res, deps));

  router.post('/cancel', async (req, res) => {
    try {
      const client = await getClientFromHeader(req);
      if (!client) return res.status(400).json({ ok: false, error: 'Unknown tenant' });
      const { eventId, leadPhone } = req.body || {};
      if (!eventId) return res.status(400).json({ ok: false, error: 'eventId required' });
      const auth = makeJwtAuth({
        clientEmail: GOOGLE_CLIENT_EMAIL,
        privateKey: GOOGLE_PRIVATE_KEY,
        privateKeyB64: GOOGLE_PRIVATE_KEY_B64
      });
      await auth.authorize();
      const cal = google.calendar({ version: 'v3', auth });
      try {
        await cal.events.delete({ calendarId: pickCalendarId(client), eventId });
      } catch (e) {
        const sc = e?.response?.status;
        if (sc !== 404 && sc !== 410) throw e;
      }
      if (leadPhone) {
        try {
          const { messagingServiceSid, fromNumber, smsClient, configured } = smsConfig(client);
          if (configured) {
            const payload = {
              to: leadPhone,
              body: 'Your appointment has been cancelled. Reply if you would like to reschedule.'
            };
            if (messagingServiceSid) payload.messagingServiceSid = messagingServiceSid;
            else if (fromNumber) payload.from = fromNumber;
            await smsClient.messages.create(payload);
          }
        } catch {
          /* best-effort SMS */
        }
      }
      res.json({ ok: true });
    } catch (e) {
      const code = e?.response?.status || 500;
      res.status(code).json({ ok: false, error: String(e?.response?.data || e?.message || e) });
    }
  });

  router.post('/reschedule', async (req, res) => {
    try {
      const client = await getClientFromHeader(req);
      if (!client) return res.status(400).json({ ok: false, error: 'Unknown tenant' });
      const { oldEventId, newStartISO, service, lead } = req.body || {};
      if (!oldEventId || !newStartISO || !service || !lead?.phone) {
        return res.status(400).json({ ok: false, error: 'missing fields' });
      }
      const tz = pickTimezone(client);
      const calendarId = pickCalendarId(client);
      const auth = makeJwtAuth({
        clientEmail: GOOGLE_CLIENT_EMAIL,
        privateKey: GOOGLE_PRIVATE_KEY,
        privateKeyB64: GOOGLE_PRIVATE_KEY_B64
      });
      await auth.authorize();
      const cal = google.calendar({ version: 'v3', auth });
      try {
        await cal.events.delete({ calendarId, eventId: oldEventId });
      } catch {
        /* ignore missing old event */
      }

      const dur = client?.booking?.defaultDurationMin || 30;
      const endISO = new Date(new Date(newStartISO).getTime() + dur * 60000).toISOString();
      const summary = `${service} — ${lead.name || ''}`.trim();

      let event;
      try {
        event = await insertEvent({
          auth,
          calendarId,
          summary,
          description: '',
          startIso: newStartISO,
          endIso: endISO,
          timezone: tz,
          extendedProperties: { private: { leadPhone: lead.phone, leadId: lead.id || '' } }
        });
      } catch (e) {
        const code = e?.response?.status || 500;
        const data = e?.response?.data || e?.message || String(e);
        return res.status(code).json({ ok: false, error: 'gcal_insert_failed', details: data });
      }

      try {
        const { messagingServiceSid, fromNumber, smsClient, configured } = smsConfig(client);
        if (configured) {
          const when = new Date(newStartISO).toLocaleString(client?.locale || 'en-GB', {
            timeZone: tz,
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          });
          const link = event?.htmlLink ? ` Calendar: ${event.htmlLink}` : '';
          const body = `✅ Rescheduled: ${service} at ${when} ${tz}.${link}`;
          const payload = { to: lead.phone, body };
          if (messagingServiceSid) payload.messagingServiceSid = messagingServiceSid;
          else if (fromNumber) payload.from = fromNumber;
          await smsClient.messages.create(payload);
        }
      } catch {
        /* best-effort SMS */
      }

      res.status(201).json({
        ok: true,
        event: { id: event.id, htmlLink: event.htmlLink, status: event.status }
      });
    } catch (e) {
      const code = e?.response?.status || 500;
      res.status(code).json({ ok: false, error: String(e?.response?.data || e?.message || e) });
    }
  });

  return router;
}

