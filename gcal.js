// gcal.js (ESM helper for Google Calendar)
import { google } from 'googleapis';

// Convert \n literals (from .env) into real newlines so JWT loads correctly
const normalizeKey = (pem) => (pem ? pem.replace(/\\n/g, '\n') : pem);

export function makeJwtAuth({ clientEmail, privateKey }) {
  if (!clientEmail || !privateKey) return null;
  return new google.auth.JWT({
    email: clientEmail,
    key: normalizeKey(privateKey),
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });
}

export async function insertEvent({ auth, calendarId, summary, description, startIso, endIso, timezone, attendees = [] }) {
  const calendar = google.calendar({ version: 'v3', auth });
  const res = await calendar.events.insert({
    calendarId,
    requestBody: {
      summary,
      description,
      start: { dateTime: startIso, timeZone: timezone },
      end:   { dateTime: endIso,   timeZone: timezone },
      attendees: attendees.map(e => ({ email: e })),
      reminders: { useDefault: true },
    },
  });
  return res.data;
}

export async function listUpcoming({ auth, calendarId, maxResults = 10 }) {
  const calendar = google.calendar({ version: 'v3', auth });
  const now = new Date().toISOString();
  const res = await calendar.events.list({
    calendarId,
    timeMin: now,
    singleEvents: true,
    orderBy: 'startTime',
    maxResults,
  });
  return res.data.items ?? [];
}
