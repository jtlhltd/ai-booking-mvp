// Google Calendar integration functions
// This file provides JWT authentication and calendar operations for the AI Booking MVP

import { google } from 'googleapis';

/**
 * Create JWT authentication for Google Calendar API
 */
export function makeJwtAuth({ clientEmail, privateKey, privateKeyB64 }) {
  const privateKeyContent = privateKeyB64 ? 
    Buffer.from(privateKeyB64, 'base64').toString('utf-8') : 
    privateKey;

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKeyContent,
    scopes: ['https://www.googleapis.com/auth/calendar']
  });

  return {
    authorize: () => auth.authorize(),
    auth
  };
}

/**
 * Insert an event into Google Calendar
 */
export async function insertEvent({ 
  auth, 
  calendarId, 
  summary, 
  description = '', 
  startIso, 
  endIso, 
  timezone = 'UTC',
  extendedProperties = {}
}) {
  const calendar = google.calendar({ version: 'v3', auth });

  const event = {
    summary,
    description,
    start: {
      dateTime: startIso,
      timeZone: timezone,
    },
    end: {
      dateTime: endIso,
      timeZone: timezone,
    },
    extendedProperties
  };

  const response = await calendar.events.insert({
    calendarId,
    resource: event,
  });

  return response.data;
}

/**
 * Check free/busy status for a time range
 */
export async function freeBusy({ auth, calendarId, timeMinISO, timeMaxISO }) {
  const calendar = google.calendar({ version: 'v3', auth });

  const response = await calendar.freebusy.query({
    resource: {
      timeMin: timeMinISO,
      timeMax: timeMaxISO,
      items: [{ id: calendarId }]
    }
  });

  const busyTimes = response.data.calendars[calendarId]?.busy || [];
  
  return busyTimes.map(busy => ({
    start: busy.start,
    end: busy.end
  }));
}

/**
 * Update an existing calendar event
 */
export async function updateEvent({ auth, calendarId, eventId, summary, description, startIso, endIso, timezone = 'UTC' }) {
  const calendar = google.calendar({ version: 'v3', auth });

  const event = {
    summary,
    description,
    start: {
      dateTime: startIso,
      timeZone: timezone,
    },
    end: {
      dateTime: endIso,
      timeZone: timezone,
    }
  };

  const response = await calendar.events.update({
    calendarId,
    eventId,
    resource: event,
  });

  return response.data;
}

/**
 * Delete a calendar event
 */
export async function deleteEvent({ auth, calendarId, eventId }) {
  const calendar = google.calendar({ version: 'v3', auth });

  await calendar.events.delete({
    calendarId,
    eventId,
  });

  return { success: true };
}

/**
 * List events in a time range
 */
export async function listEvents({ auth, calendarId, timeMin, timeMax, maxResults = 10 }) {
  const calendar = google.calendar({ version: 'v3', auth });

  const response = await calendar.events.list({
    calendarId,
    timeMin,
    timeMax,
    maxResults,
    singleEvents: true,
    orderBy: 'startTime'
  });

  return response.data.items || [];
}
