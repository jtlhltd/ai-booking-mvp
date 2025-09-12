// gcal.js — Google Calendar helpers (patched with freeBusy)
import { google } from 'googleapis';

export function makeJwtAuth({ clientEmail, privateKey }) {
  return new google.auth.JWT(
    clientEmail,
    null,
    (privateKey || '').replace(/\n/g, '\n'),
    ['https://www.googleapis.com/auth/calendar']
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
      end: { dateTime: endIso, timeZone: timezone },
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

// NEW: Free/Busy query — returns array of { start, end } busy blocks in the range
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
