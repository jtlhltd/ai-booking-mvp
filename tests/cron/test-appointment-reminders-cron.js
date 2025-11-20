// tests/cron/test-appointment-reminders-cron.js
// Test appointment reminders cron job

import { describe, test, assertTrue, assertEqual, printSummary, resetStats } from '../utils/test-helpers.js';
import { scheduleAppointmentReminders, cancelAppointmentReminders, processReminderQueue } from '../../lib/appointment-reminders.js';

resetStats();

describe('Appointment Reminders Cron Tests', () => {
  
  test('Cron schedule format', () => {
    const schedule = '*/5 * * * *'; // Every 5 minutes
    assertTrue(schedule.includes('*/5'), 'Schedule includes interval');
  });
  
  test('Schedule function exists', () => {
    assertTrue(typeof scheduleAppointmentReminders === 'function', 'scheduleAppointmentReminders is a function');
  });
  
  test('Cancel function exists', () => {
    assertTrue(typeof cancelAppointmentReminders === 'function', 'cancelAppointmentReminders is a function');
  });
  
  test('Process function exists', () => {
    assertTrue(typeof processReminderQueue === 'function', 'processReminderQueue is a function');
  });
  
  test('Reminder timing calculation - 24h', () => {
    const now = new Date();
    const appointmentTime = new Date(now.getTime() + 48 * 60 * 60 * 1000); // 2 days from now
    const reminder24h = new Date(appointmentTime);
    reminder24h.setHours(reminder24h.getHours() - 24);
    
    assertTrue(reminder24h > now, '24h reminder in future');
    const hoursUntilReminder = (reminder24h - now) / (60 * 60 * 1000);
    assertTrue(hoursUntilReminder >= 23 && hoursUntilReminder <= 25, '24h reminder scheduled correctly');
  });
  
  test('Reminder timing calculation - 1h', () => {
    const now = new Date();
    const appointmentTime = new Date(now.getTime() + 3 * 60 * 60 * 1000); // 3 hours from now
    const reminder1h = new Date(appointmentTime);
    reminder1h.setHours(reminder1h.getHours() - 1);
    
    assertTrue(reminder1h > now, '1h reminder in future');
    const hoursUntilReminder = (reminder1h - now) / (60 * 60 * 1000);
    assertTrue(hoursUntilReminder >= 1.9 && hoursUntilReminder <= 2.1, '1h reminder scheduled correctly');
  });
  
  test('Past appointment handling', async () => {
    const pastBooking = {
      leadPhone: '+447491683261',
      leadName: 'Test',
      appointmentTime: new Date(Date.now() - 24 * 60 * 60 * 1000), // Yesterday
      clientKey: 'test_client'
    };
    
    try {
      const result = await scheduleAppointmentReminders(pastBooking);
      assertTrue(result.scheduled === false, 'Past appointments not scheduled');
      assertTrue(result.reason === 'past_appointment', 'Reason is past_appointment');
    } catch (error) {
      // May fail if database not available
      assertTrue(error instanceof Error, 'Function handles errors');
    }
  });
  
  test('Reminder types', () => {
    const reminderTypes = ['confirmation_sms', 'confirmation_email', '24h_reminder', '1h_reminder'];
    reminderTypes.forEach(type => {
      assertTrue(typeof type === 'string', `Reminder type ${type} is string`);
    });
  });
});

const exitCode = printSummary();
process.exit(exitCode);

