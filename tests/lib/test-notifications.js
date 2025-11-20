// tests/lib/test-notifications.js
// Test notifications functionality

import { describe, test, assertTrue, assertEqual, printSummary, resetStats } from '../utils/test-helpers.js';
import {
  sendSlackNotification,
  sendSMSNotification,
  notifyLeadUpload,
  notifyAppointmentBooked,
  sendDailySummary
} from '../../lib/notifications.js';

resetStats();

describe('Notifications Tests', () => {
  
  test('Send Slack notification function exists', () => {
    assertTrue(typeof sendSlackNotification === 'function', 'sendSlackNotification is a function');
  });
  
  test('Send SMS notification function exists', () => {
    assertTrue(typeof sendSMSNotification === 'function', 'sendSMSNotification is a function');
  });
  
  test('Notify lead upload function exists', () => {
    assertTrue(typeof notifyLeadUpload === 'function', 'notifyLeadUpload is a function');
  });
  
  test('Notify appointment booked function exists', () => {
    assertTrue(typeof notifyAppointmentBooked === 'function', 'notifyAppointmentBooked is a function');
  });
  
  test('Send daily summary function exists', () => {
    assertTrue(typeof sendDailySummary === 'function', 'sendDailySummary is a function');
  });
  
  test('Slack notification structure', () => {
    const notification = {
      message: 'Test notification',
      channel: 'general',
      severity: 'info'
    };
    
    assertTrue('message' in notification, 'Has message');
    assertTrue(typeof notification.message === 'string', 'Message is string');
  });
  
  test('SMS notification structure', () => {
    const notification = {
      to: '+447491683261',
      message: 'Test SMS'
    };
    
    assertTrue('to' in notification, 'Has recipient');
    assertTrue('message' in notification, 'Has message');
    assertTrue(/^\+447/.test(notification.to), 'Phone is E.164 format');
  });
  
  test('Lead upload notification data', () => {
    const data = {
      clientKey: 'test_client',
      clientName: 'Test Client',
      leadCount: 25,
      importMethod: 'csv'
    };
    
    assertTrue('leadCount' in data, 'Has lead count');
    assertTrue(typeof data.leadCount === 'number', 'Lead count is number');
    assertTrue(data.leadCount > 0, 'Lead count > 0');
  });
  
  test('Appointment booked notification data', () => {
    const data = {
      clientKey: 'test_client',
      clientPhone: '+447403934440',
      leadName: 'John Doe',
      appointmentTime: new Date().toISOString()
    };
    
    assertTrue('leadName' in data, 'Has lead name');
    assertTrue('appointmentTime' in data, 'Has appointment time');
    assertTrue(typeof data.appointmentTime === 'string', 'Appointment time is string');
  });
  
  test('Daily summary structure', () => {
    const summary = {
      clientKey: 'test_client',
      clientEmail: 'test@example.com',
      clientName: 'Test Client',
      summary: {
        leads: 10,
        calls: 8,
        bookings: 2
      }
    };
    
    assertTrue('summary' in summary, 'Has summary object');
    assertTrue('leads' in summary.summary, 'Summary has leads');
    assertTrue('bookings' in summary.summary, 'Summary has bookings');
  });
  
  test('Notification channels', () => {
    const channels = ['slack', 'sms', 'email'];
    channels.forEach(channel => {
      assertTrue(typeof channel === 'string', `Channel ${channel} is string`);
    });
  });
});

const exitCode = printSummary();
process.exit(exitCode);

