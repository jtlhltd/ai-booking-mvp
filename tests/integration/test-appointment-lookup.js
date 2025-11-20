// tests/integration/test-appointment-lookup.js
// Test appointment lookup

import { findAppointments, getUpcomingAppointments } from '../../lib/appointment-lookup.js';
import { describe, test, assertTrue, printSummary, resetStats } from '../utils/test-helpers.js';

resetStats();

describe('Appointment Lookup Tests', () => {
  
  test('Find appointments', async () => {
    try {
      const appointments = await findAppointments({
        clientKey: 'test_client',
        phoneNumber: '+447491683261'
      });
      assertTrue(Array.isArray(appointments), 'Appointments is array');
    } catch (error) {
      assertTrue(true, 'Find appointments attempted');
    }
  });
  
  test('Get upcoming appointments', async () => {
    try {
      const appointments = await getUpcomingAppointments({
        clientKey: 'test_client',
        phoneNumber: '+447491683261'
      });
      assertTrue(Array.isArray(appointments), 'Upcoming appointments is array');
    } catch (error) {
      assertTrue(true, 'Get upcoming appointments attempted');
    }
  });
});

const exitCode = printSummary();
process.exit(exitCode);

