// gcal.js — Google Calendar helpers (fully patched)
import { google } from 'googleapis';

/**
 * Create a JWT auth client.
 * Accepts:
 *  - GOOGLE_PRIVATE_KEY with real newlines
 *  - GOOGLE_PRIVATE_KEY containing literal "\\n"
 *  - GOOGLE_PRIVATE_KEY_B64 (base64 of the PEM)
 */
export function makeJwtAuth({ clientEmail, privateKey, privateKeyB64 }) {
  let key = privateKey || '';
  if (!key && privateKeyB64) {
    try { key = Buffer.from(privateKeyB64, 'base64').toString('utf8'); } catch {}
  }
  if (key && key.includes('\\n')) {
    key = key.replace(/\\n/g, '\n');
  }
  return new google.auth.JWT(
    clientEmail,
    null,
    key,
    [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events'
    ]
  );
}

export async function insertEvent({ auth, calendarId, summary, description, startIso, endIso, timezone, attendees = [] }) {
  const calendar = google.calendar({ version: 'v3', auth });
  const resp = await calendar.events.insert({
    calendarId,
    requestBody: {
      summary,
      description,
      start: { dateTime: startIso, timeZone: timezone },
      end:   { dateTime: endIso,   timeZone: timezone },
      attendees: attendees.map(e => ({ email: e }))
    }
  });
  return resp.data;
}

export async function listUpcoming({ auth, calendarId, maxResults = 10 }) {
  const calendar = google.calendar({ version: 'v3', auth });
  const resp = await calendar.events.list({
    calendarId,
    maxResults,
    singleEvents: true,
    orderBy: 'startTime',
    timeMin: new Date().toISOString(),
  });
  return resp.data.items || [];
}

// Free/Busy query
export async function freeBusy({ auth, calendarId, timeMinISO, timeMaxISO }) {
  const calendar = google.calendar({ version: 'v3', auth });
  const resp = await calendar.freebusy.query({
    requestBody: {
      timeMin: timeMinISO,
      timeMax: timeMaxISO,
      items: [{ id: calendarId }],
    }
  });
  const cal = resp.data?.calendars?.[calendarId];
  return Array.isArray(cal?.busy) ? cal.busy : [];
}
