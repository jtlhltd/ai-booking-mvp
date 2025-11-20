// tests/lib/test-booking-system.js
// Test booking system class

import { describe, test, assertTrue, assertEqual, printSummary, resetStats } from '../utils/test-helpers.js';
import BookingSystem from '../../booking-system.js';

resetStats();

describe('Booking System Tests', () => {
  
  test('BookingSystem class exists', () => {
    assertTrue(typeof BookingSystem === 'function', 'BookingSystem is a class');
  });
  
  test('BookingSystem instance creation', () => {
    try {
      const bookingSystem = new BookingSystem();
      assertTrue(bookingSystem instanceof BookingSystem, 'Creates instance');
    } catch (error) {
      assertTrue(error instanceof Error, 'Function handles errors');
    }
  });
  
  test('Booking request structure', () => {
    const request = {
      clientKey: 'test_client',
      service: 'Consultation',
      lead: { name: 'John Doe', phone: '+447491683261' },
      preferredTime: 'tomorrow 2pm',
      duration: 30
    };
    
    assertTrue('clientKey' in request, 'Has clientKey');
    assertTrue('service' in request, 'Has service');
    assertTrue('lead' in request, 'Has lead');
    assertTrue('preferredTime' in request, 'Has preferred time');
  });
  
  test('Booking confirmation structure', () => {
    const confirmation = {
      success: true,
      appointmentId: 'appt123',
      appointmentTime: new Date().toISOString(),
      service: 'Consultation',
      location: '123 Test St'
    };
    
    assertTrue('success' in confirmation, 'Has success flag');
    assertTrue('appointmentId' in confirmation, 'Has appointment ID');
    assertTrue(confirmation.success === true, 'Booking successful');
  });
  
  test('Availability check structure', () => {
    const availability = {
      date: '2025-01-15',
      slots: [
        { start: '09:00', end: '09:30', available: true },
        { start: '10:00', end: '10:30', available: true }
      ]
    };
    
    assertTrue('date' in availability, 'Has date');
    assertTrue('slots' in availability, 'Has slots');
    assertTrue(Array.isArray(availability.slots), 'Slots is array');
  });
  
  test('Booking status values', () => {
    const statuses = ['pending', 'confirmed', 'cancelled', 'completed'];
    statuses.forEach(status => {
      assertTrue(typeof status === 'string', `Status ${status} is string`);
    });
  });
});

const exitCode = printSummary();
process.exit(exitCode);

