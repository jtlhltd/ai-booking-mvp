import { createHash } from 'crypto';
import { google } from 'googleapis';

import { makeJwtAuth, freeBusy } from '../gcal.js';

/**
 * POST /api/calendar/book-slot — extracted from server.js for testability.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {{
 *   getClientFromHeader: (req: any) => Promise<any>,
 *   pickTimezone: (client: any) => string,
 *   pickCalendarId: (client: any) => string,
 *   getGoogleCredentials: () => { clientEmail: string, privateKey: string, privateKeyB64: string },
 *   smsConfig: (client: any) => { messagingServiceSid?: string, fromNumber?: string, smsClient: any, configured: boolean },
 *   renderTemplate: (template: string, vars: Record<string, unknown>) => string,
 *   scheduleAppointmentReminders: (args: any) => Promise<any>,
 *   appendToSheet: (args: any) => Promise<any>
 * }} deps
 */
export async function handleCalendarBookSlot(req, res, deps) {
  try {
    const {
      getClientFromHeader,
      pickTimezone,
      pickCalendarId,
      getGoogleCredentials,
      smsConfig,
      renderTemplate,
      scheduleAppointmentReminders,
      appendToSheet
    } = deps || {};

    const client = await getClientFromHeader(req);
    if (!client) return res.status(400).json({ ok: false, error: 'Unknown tenant (missing X-Client-Key)' });

    const { clientEmail, privateKey, privateKeyB64 } = getGoogleCredentials();
    if (!(clientEmail && (privateKey || privateKeyB64))) {
      return res.status(400).json({ ok: false, error: 'Google env missing' });
    }

    const tz = pickTimezone(client);
    const calendarId = pickCalendarId(client);

    const { service, lead, start, durationMin } = req.body || {};

    if (!service || typeof service !== 'string') {
      return res.status(400).json({ ok: false, error: 'Missing/invalid \"service\" (string)' });
    }
    if (!lead || typeof lead !== 'object' || !lead.name || !lead.phone) {
      return res.status(400).json({ ok: false, error: 'Missing/invalid \"lead\" (need name, phone)' });
    }

    const startISO = (() => {
      try {
        return new Date(start).toISOString();
      } catch {
        return null;
      }
    })();
    if (!start || !startISO) {
      return res.status(400).json({ ok: false, error: 'Missing/invalid \"start\" (ISO datetime)' });
    }

    const dur = Number.isFinite(+durationMin) ? +durationMin : (client?.booking?.defaultDurationMin || 30);
    const endISO = new Date(new Date(startISO).getTime() + dur * 60000).toISOString();

    const auth = makeJwtAuth({ clientEmail, privateKey, privateKeyB64 });
    await auth.authorize();

    const busy = await freeBusy({ auth, calendarId, timeMinISO: startISO, timeMaxISO: endISO });
    const conflict = (busy || []).some((b) => !(endISO <= b.start || startISO >= b.end));
    if (conflict) {
      return res.status(409).json({ ok: false, error: 'Requested time is busy', busy });
    }

    const summary = `${service} — ${lead.name}`;
    const description = [
      `Service: ${service}`,
      `Lead: ${lead.name}`,
      lead.phone ? `Phone: ${lead.phone}` : null,
      lead.id ? `Lead ID: ${lead.id}` : null,
      `Tenant: ${client?.clientKey || 'default'}`
    ]
      .filter(Boolean)
      .join('\n');

    const rawKey = `${client?.clientKey || 'default'}|${service}|${startISO}|${lead.phone}`;
    const deterministicId = ('bk' + createHash('sha1').update(rawKey).digest('hex').slice(0, 20)).toLowerCase();

    const cal = google.calendar({ version: 'v3', auth });

    let respInsert;
    try {
      respInsert = await cal.events.insert({
        calendarId,
        requestBody: {
          id: deterministicId,
          summary,
          description,
          start: { dateTime: startISO, timeZone: tz },
          end: { dateTime: endISO, timeZone: tz },
          extendedProperties: { private: { leadPhone: lead.phone, leadId: lead.id || '' } }
        }
      });
    } catch (err) {
      const sc = err?.response?.status;
      const msg = err?.response?.data || err?.message || '';
      if (sc === 400 && String(msg).toLowerCase().includes('id')) {
        respInsert = await cal.events.insert({
          calendarId,
          requestBody: {
            summary,
            description,
            start: { dateTime: startISO, timeZone: tz },
            end: { dateTime: endISO, timeZone: tz },
            extendedProperties: { private: { leadPhone: lead.phone, leadId: lead.id || '' } }
          }
        });
      } else {
        throw err;
      }
    }

    const event = respInsert?.data || null;

    // Send confirmation SMS if tenant SMS is configured
    try {
      const { messagingServiceSid, fromNumber, smsClient, configured } = smsConfig(client);
      if (configured) {
        const when = new Date(startISO).toLocaleString(client?.locale || 'en-GB', {
          timeZone: tz,
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        });
        const brand = client?.displayName || client?.clientKey || 'Our Clinic';
        const link = event?.htmlLink ? ` Calendar: ${event.htmlLink}` : '';
        const sig = client?.brandSignature ? ` ${client.brandSignature}` : '';
        const defaultBody = `Hi {{name}}, your {{service}} is booked with {{brand}} for {{when}} {{tz}}.{{link}}{{sig}} Reply STOP to opt out.`;
        const templ = client?.smsTemplates?.confirm || defaultBody;
        const body = renderTemplate(templ, { name: lead.name, service, brand, when, tz, link, sig });
        const payload = { to: lead.phone, body };
        if (messagingServiceSid) payload.messagingServiceSid = messagingServiceSid;
        else if (fromNumber) payload.from = fromNumber;
        await smsClient.messages.create(payload);
      }
    } catch (e) {
      console.error('confirm sms failed', e?.message || e);
    }

    // Schedule appointment reminders
    try {
      await scheduleAppointmentReminders({
        appointmentId: event.id,
        clientKey: client?.clientKey || 'default',
        leadPhone: lead.phone,
        appointmentTime: new Date(startISO),
        clientSettings: client?.reminder_settings || {}
      });
    } catch (e) {
      console.error('reminder scheduling failed', e?.message || e);
    }

    // Append to Google Sheets ledger (optional)
    try {
      if (process.env.BOOKINGS_SHEET_ID) {
        await appendToSheet({
          spreadsheetId: process.env.BOOKINGS_SHEET_ID,
          sheetName: 'Bookings',
          values: [
            new Date().toISOString(),
            client?.clientKey || client?.id || '',
            service,
            lead?.name || '',
            lead?.phone || '',
            event?.id || '',
            event?.htmlLink || '',
            startISO
          ]
        });
      }
    } catch (e) {
      console.warn('sheets append error', e?.message || e);
    }

    return res.status(201).json({
      ok: true,
      event: {
        id: event.id,
        htmlLink: event.htmlLink,
        status: event.status
      },
      tenant: { clientKey: client?.clientKey || null, calendarId, timezone: tz }
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}

