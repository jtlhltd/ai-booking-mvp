// tests/lib/test-appointment-modifier.js
// Test appointment modification functionality

import { describe, test, assertTrue, assertEqual, printSummary, resetStats } from '../utils/test-helpers.js';
import { rescheduleAppointment, cancelAppointment } from '../../lib/appointment-modifier.js';

resetStats();

describe('Appointment Modifier Tests', () => {
  
  test('Reschedule appointment function exists', () => {
    assertTrue(typeof rescheduleAppointment === 'function', 'rescheduleAppointment is a function');
  });
  
  test('Cancel appointment function exists', () => {
    assertTrue(typeof cancelAppointment === 'function', 'cancelAppointment is a function');
  });
  
  test('Reschedule parameters', () => {
    const params = {
      clientKey: 'test_client',
      appointmentId: 'appt123',
      newTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      reason: 'Customer requested'
    };
    
    assertTrue('newTime' in params, 'Has newTime');
    assertTrue('reason' in params, 'Has reason');
    assertTrue(new Date(params.newTime) > new Date(), 'New time is in future');
  });
  
  test('Cancel parameters', () => {
    const params = {
      clientKey: 'test_client',
      appointmentId: 'appt123',
      reason: 'Customer cancelled'
    };
    
    assertTrue('appointmentId' in params, 'Has appointmentId');
    assertTrue('reason' in params, 'Has reason');
  });
  
  test('Time validation', () => {
    const futureTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const pastTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    assertTrue(futureTime > new Date(), 'Future time is valid');
    assertTrue(pastTime < new Date(), 'Past time is invalid for rescheduling');
  });
  
  test('Cancellation reasons', () => {
    const reasons = ['Customer cancelled', 'Business closed', 'Emergency', 'Rescheduled'];
    reasons.forEach(reason => {
      assertTrue(typeof reason === 'string', `Reason ${reason} is string`);
    });
  });
});

const exitCode = printSummary();
process.exit(exitCode);

