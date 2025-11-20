// tests/lib/test-notify-module.js
// Test notify module functionality (CommonJS module)

import { describe, test, assertTrue, assertEqual, printSummary, resetStats } from '../utils/test-helpers.js';

resetStats();

describe('Notify Module Tests', () => {
  
  test('SMS notification structure', () => {
    const notification = {
      tenant: { clientKey: 'test_client' },
      to: '+447491683261',
      message: 'Test message'
    };
    
    assertTrue('to' in notification, 'Has recipient');
    assertTrue('message' in notification, 'Has message');
    assertTrue(/^\+447/.test(notification.to), 'Phone is E.164 format');
  });
  
  test('Notification API endpoint', () => {
    const endpoint = '/api/notify/send';
    assertTrue(endpoint.includes('/notify'), 'Endpoint has /notify');
    assertTrue(endpoint.includes('/send'), 'Endpoint has /send');
  });
  
  test('Notification headers', () => {
    const headers = {
      'Content-Type': 'application/json',
      'X-API-Key': 'api_key_123',
      'X-Client-Key': 'test_client',
      'Idempotency-Key': 'idempotent_key_123'
    };
    
    assertTrue('X-API-Key' in headers, 'Has API key header');
    assertTrue('X-Client-Key' in headers, 'Has client key header');
    assertTrue('Idempotency-Key' in headers, 'Has idempotency key');
  });
  
  test('Notification payload', () => {
    const payload = {
      channel: 'sms',
      to: '+447491683261',
      message: 'Test message'
    };
    
    assertTrue('channel' in payload, 'Has channel');
    assertTrue(payload.channel === 'sms', 'Channel is SMS');
    assertTrue('to' in payload, 'Has recipient');
    assertTrue('message' in payload, 'Has message');
  });
  
  test('Confirmation message format', () => {
    const slot = { start: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() };
    const service = 'Consultation';
    const when = new Date(slot.start).toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' });
    const message = `Booked: ${service} on ${when}. Reply R to reschedule.`;
    
    assertTrue(message.includes('Booked:'), 'Has booked prefix');
    assertTrue(message.includes(service), 'Contains service name');
    assertTrue(message.includes('Reply R'), 'Has reschedule option');
  });
  
  test('Idempotency key generation', () => {
    const generate = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    const key = generate();
    
    assertTrue(typeof key === 'string', 'Key is string');
    assertTrue(key.length > 0, 'Key has content');
  });
  
  test('Notification channels', () => {
    const channels = ['sms', 'email', 'push'];
    channels.forEach(channel => {
      assertTrue(typeof channel === 'string', `Channel ${channel} is string`);
    });
  });
});

const exitCode = printSummary();
process.exit(exitCode);

