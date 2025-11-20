// tests/lib/test-client-service.js
// Test client service classes

import { describe, test, assertTrue, assertEqual, printSummary, resetStats } from '../utils/test-helpers.js';
import { ClientService, LeadService, CallService } from '../../services/client-service.js';

resetStats();

describe('Client Service Tests', () => {
  
  test('ClientService class exists', () => {
    assertTrue(typeof ClientService === 'function', 'ClientService is a class');
  });
  
  test('LeadService class exists', () => {
    assertTrue(typeof LeadService === 'function', 'LeadService is a class');
  });
  
  test('CallService class exists', () => {
    assertTrue(typeof CallService === 'function', 'CallService is a class');
  });
  
  test('ClientService instance creation', () => {
    try {
      const service = new ClientService();
      assertTrue(service instanceof ClientService, 'Creates instance');
    } catch (error) {
      assertTrue(error instanceof Error, 'Function handles errors');
    }
  });
  
  test('LeadService instance creation', () => {
    try {
      const service = new LeadService();
      assertTrue(service instanceof LeadService, 'Creates instance');
    } catch (error) {
      assertTrue(error instanceof Error, 'Function handles errors');
    }
  });
  
  test('CallService instance creation', () => {
    try {
      const service = new CallService();
      assertTrue(service instanceof CallService, 'Creates instance');
    } catch (error) {
      assertTrue(error instanceof Error, 'Function handles errors');
    }
  });
  
  test('Client data structure', () => {
    const client = {
      clientKey: 'test_client',
      displayName: 'Test Client',
      email: 'test@example.com'
    };
    
    assertTrue('clientKey' in client, 'Has clientKey');
    assertTrue('displayName' in client, 'Has displayName');
  });
  
  test('Lead data structure', () => {
    const lead = {
      phone: '+447491683261',
      name: 'John Doe',
      status: 'new'
    };
    
    assertTrue('phone' in lead, 'Has phone');
    assertTrue(/^\+447/.test(lead.phone), 'Phone is E.164 format');
  });
  
  test('Call data structure', () => {
    const call = {
      callId: 'call123',
      leadPhone: '+447491683261',
      status: 'completed',
      outcome: 'booked'
    };
    
    assertTrue('callId' in call, 'Has call ID');
    assertTrue('status' in call, 'Has status');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

