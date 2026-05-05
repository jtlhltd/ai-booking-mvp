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
  // Ensure key has proper format (PEM keys need newlines, don't trim)
  // But remove any carriage returns that might cause issues
  if (key) {
    key = key.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }
  
  // Debug: Log key info (without exposing full key)
  if (key) {
    console.log('[GCAL] JWT Auth setup:', {
      clientEmail,
      keyLength: key.length,
      keyHasNewlines: key.includes('\n'),
      keyStartsWith: key.substring(0, 30),
      keyEndsWith: key.substring(key.length - 30)
    });
  }
  
  // Create JWT with explicit options to ensure consistent behavior
  const jwtClient = new google.auth.JWT({
    email: clientEmail,
    key: key,
    scopes: [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events'
    ],
    // Explicitly set these to avoid any defaults that might differ between environments
    subject: undefined, // No impersonation needed
    keyId: undefined, // Let Google derive from the key
  });
  
  return jwtClient;
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
