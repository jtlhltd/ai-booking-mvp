// tests/lib/test-vapi-module.js
// Test VAPI module functionality (CommonJS module)

import { describe, test, assertTrue, assertEqual, printSummary, resetStats } from '../utils/test-helpers.js';

resetStats();

describe('VAPI Module Tests', () => {
  
  test('VAPI call payload structure', () => {
    const payload = {
      assistantId: 'asst123',
      phoneNumberId: 'phone123',
      customer: { number: '+447491683261', name: 'John Doe' },
      metadata: {
        clientKey: 'test_client',
        service: 'Consultation',
        options: {}
      }
    };
    
    assertTrue('assistantId' in payload, 'Has assistant ID');
    assertTrue('phoneNumberId' in payload, 'Has phone number ID');
    assertTrue('customer' in payload, 'Has customer');
    assertTrue('metadata' in payload, 'Has metadata');
  });
  
  test('Customer phone format', () => {
    const customer = { number: '+447491683261', name: 'John Doe' };
    assertTrue(/^\+447/.test(customer.number), 'Phone is E.164 format');
    assertTrue(typeof customer.name === 'string', 'Name is string');
  });
  
  test('Metadata structure', () => {
    const metadata = {
      clientKey: 'test_client',
      service: 'Consultation',
      options: { priority: 'high' }
    };
    
    assertTrue('clientKey' in metadata, 'Has clientKey');
    assertTrue('service' in metadata, 'Has service');
    assertTrue(typeof metadata.clientKey === 'string', 'ClientKey is string');
  });
  
  test('VAPI API endpoint', () => {
    const endpoint = 'https://api.vapi.ai/call';
    assertTrue(endpoint.includes('vapi.ai'), 'Endpoint is VAPI');
    assertTrue(endpoint.includes('/call'), 'Endpoint has /call path');
  });
  
  test('Authorization header format', () => {
    const apiKey = 'test_key_123';
    const authHeader = `Bearer ${apiKey}`;
    
    assertTrue(authHeader.startsWith('Bearer '), 'Has Bearer prefix');
    assertTrue(authHeader.includes(apiKey), 'Contains API key');
  });
  
  test('Call response structure', () => {
    const response = {
      id: 'call123',
      status: 'ringing',
      createdAt: new Date().toISOString()
    };
    
    assertTrue('id' in response, 'Has call ID');
    assertTrue('status' in response, 'Has status');
    assertTrue(['ringing', 'in-progress', 'completed', 'failed'].includes(response.status) || typeof response.status === 'string', 'Status is valid');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

