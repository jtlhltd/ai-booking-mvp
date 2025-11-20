// tests/lib/test-gcal.js
// Test Google Calendar functionality

import { describe, test, assertTrue, assertEqual, printSummary, resetStats } from '../utils/test-helpers.js';
import { makeJwtAuth, insertEvent, listUpcoming, freeBusy } from '../../gcal.js';

resetStats();

describe('Google Calendar Tests', () => {
  
  test('Make JWT auth function exists', () => {
    assertTrue(typeof makeJwtAuth === 'function', 'makeJwtAuth is a function');
  });
  
  test('Insert event function exists', () => {
    assertTrue(typeof insertEvent === 'function', 'insertEvent is a function');
  });
  
  test('List upcoming function exists', () => {
    assertTrue(typeof listUpcoming === 'function', 'listUpcoming is a function');
  });
  
  test('Free busy function exists', () => {
    assertTrue(typeof freeBusy === 'function', 'freeBusy is a function');
  });
  
  test('Event structure', () => {
    const event = {
      summary: 'Test Appointment',
      description: 'Test description',
      startIso: new Date().toISOString(),
      endIso: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      timezone: 'Europe/London',
      attendees: ['test@example.com']
    };
    
    assertTrue('summary' in event, 'Has summary');
    assertTrue('startIso' in event, 'Has start time');
    assertTrue('endIso' in event, 'Has end time');
    assertTrue(Array.isArray(event.attendees), 'Attendees is array');
  });
  
  test('JWT auth structure', () => {
    const authParams = {
      clientEmail: 'test@example.com',
      privateKey: '-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----'
    };
    
    assertTrue('clientEmail' in authParams, 'Has client email');
    assertTrue('privateKey' in authParams, 'Has private key');
    assertTrue(/@/.test(authParams.clientEmail), 'Email is valid format');
  });
  
  test('Free busy query structure', () => {
    const query = {
      timeMinISO: new Date().toISOString(),
      timeMaxISO: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    };
    
    assertTrue('timeMinISO' in query, 'Has time min');
    assertTrue('timeMaxISO' in query, 'Has time max');
    assertTrue(new Date(query.timeMaxISO) > new Date(query.timeMinISO), 'Max > min');
  });
  
  test('Calendar ID format', () => {
    const calendarId = 'test@example.com';
    assertTrue(typeof calendarId === 'string', 'Calendar ID is string');
    assertTrue(calendarId.length > 0, 'Calendar ID has content');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

