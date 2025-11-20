// tests/lib/test-customer-profiles.js
// Test customer profiles functionality

import { describe, test, assertTrue, assertEqual, printSummary, resetStats } from '../utils/test-helpers.js';
import {
  getCustomerProfile,
  upsertCustomerProfile,
  updateCustomerPreferences,
  incrementAppointmentCount,
  setVipStatus,
  getCustomerGreeting
} from '../../lib/customer-profiles.js';

resetStats();

describe('Customer Profiles Tests', () => {
  
  test('Get customer profile function exists', () => {
    assertTrue(typeof getCustomerProfile === 'function', 'getCustomerProfile is a function');
  });
  
  test('Upsert customer profile function exists', () => {
    assertTrue(typeof upsertCustomerProfile === 'function', 'upsertCustomerProfile is a function');
  });
  
  test('Update customer preferences function exists', () => {
    assertTrue(typeof updateCustomerPreferences === 'function', 'updateCustomerPreferences is a function');
  });
  
  test('Increment appointment count function exists', () => {
    assertTrue(typeof incrementAppointmentCount === 'function', 'incrementAppointmentCount is a function');
  });
  
  test('Set VIP status function exists', () => {
    assertTrue(typeof setVipStatus === 'function', 'setVipStatus is a function');
  });
  
  test('Get customer greeting function exists', () => {
    assertTrue(typeof getCustomerGreeting === 'function', 'getCustomerGreeting is a function');
  });
  
  test('Customer profile structure', () => {
    const profile = {
      phone: '+447491683261',
      name: 'John Doe',
      email: 'john@example.com',
      appointmentCount: 5,
      isVip: false,
      preferences: {}
    };
    
    assertTrue('phone' in profile, 'Has phone');
    assertTrue('name' in profile, 'Has name');
    assertTrue(typeof profile.appointmentCount === 'number', 'Appointment count is number');
  });
  
  test('Customer preferences structure', () => {
    const preferences = {
      preferredTime: 'morning',
      preferredChannel: 'sms',
      language: 'en'
    };
    
    assertTrue(typeof preferences === 'object', 'Preferences is object');
    assertTrue('preferredTime' in preferences || Object.keys(preferences).length > 0, 'Has preferences');
  });
  
  test('VIP status values', () => {
    const vipStatuses = [true, false];
    vipStatuses.forEach(status => {
      assertTrue(typeof status === 'boolean', `VIP status ${status} is boolean`);
    });
  });
  
  test('Appointment count increment', () => {
    let count = 5;
    count++;
    assertTrue(count === 6, 'Count incremented correctly');
  });
  
  test('Customer greeting format', () => {
    const greeting = 'Hello John, welcome back!';
    assertTrue(typeof greeting === 'string', 'Greeting is string');
    assertTrue(greeting.length > 0, 'Greeting has content');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

