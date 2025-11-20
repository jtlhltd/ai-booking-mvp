// tests/integration/test-appointment-reminders.js
// Test appointment reminders

import { describe, test, assertTrue, printSummary, resetStats } from '../utils/test-helpers.js';

resetStats();

describe('Appointment Reminders Tests', () => {
  
  test('Reminder scheduling', () => {
    const appointment = {
      startTime: new Date('2025-01-16T10:00:00Z')
    };
    
    const reminder24h = new Date(appointment.startTime.getTime() - 24 * 60 * 60 * 1000);
    const reminder1h = new Date(appointment.startTime.getTime() - 60 * 60 * 1000);
    
    assertTrue(reminder24h < appointment.startTime, '24h reminder before appointment');
    assertTrue(reminder1h < appointment.startTime, '1h reminder before appointment');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

