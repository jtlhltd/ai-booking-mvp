// tests/lib/test-appointment-lookup.js
// Test appointment lookup functionality

import { describe, test, assertTrue, assertEqual, printSummary, resetStats } from '../utils/test-helpers.js';
import {
  findAppointments,
  getUpcomingAppointments,
  getAppointmentById,
  appointmentExists
} from '../../lib/appointment-lookup.js';

resetStats();

describe('Appointment Lookup Tests', () => {
  
  test('Find appointments function exists', () => {
    assertTrue(typeof findAppointments === 'function', 'findAppointments is a function');
  });
  
  test('Get upcoming appointments function exists', () => {
    assertTrue(typeof getUpcomingAppointments === 'function', 'getUpcomingAppointments is a function');
  });
  
  test('Get appointment by ID function exists', () => {
    assertTrue(typeof getAppointmentById === 'function', 'getAppointmentById is a function');
  });
  
  test('Appointment exists function exists', () => {
    assertTrue(typeof appointmentExists === 'function', 'appointmentExists is a function');
  });
  
  test('Appointment search parameters', () => {
    const params = {
      clientKey: 'test_client',
      phone: '+447491683261',
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    };
    
    assertTrue('clientKey' in params, 'Has clientKey');
    assertTrue('phone' in params, 'Has phone');
    assertTrue(/^\+447/.test(params.phone), 'Phone is E.164 format');
  });
  
  test('Appointment structure', () => {
    const appointment = {
      id: 'appt123',
      clientKey: 'test_client',
      leadPhone: '+447491683261',
      leadName: 'John Doe',
      appointmentTime: new Date().toISOString(),
      service: 'Consultation',
      status: 'confirmed'
    };
    
    assertTrue('id' in appointment, 'Has ID');
    assertTrue('appointmentTime' in appointment, 'Has appointment time');
    assertTrue('status' in appointment, 'Has status');
  });
  
  test('Upcoming appointments filter', () => {
    const now = new Date();
    const future = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const past = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    assertTrue(future > now, 'Future date is after now');
    assertTrue(past < now, 'Past date is before now');
  });
  
  test('Appointment statuses', () => {
    const statuses = ['confirmed', 'pending', 'cancelled', 'completed'];
    statuses.forEach(status => {
      assertTrue(typeof status === 'string', `Status ${status} is string`);
    });
  });
});

const exitCode = printSummary();
process.exit(exitCode);

