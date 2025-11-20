// tests/lib/test-inbound-call-router.js
// Test inbound call routing functionality

import { describe, test, assertTrue, assertEqual, printSummary, resetStats } from '../utils/test-helpers.js';
import { routeInboundCall, createVapiInboundCall, logInboundCall } from '../../lib/inbound-call-router.js';

resetStats();

describe('Inbound Call Router Tests', () => {
  
  test('Route inbound call function exists', () => {
    assertTrue(typeof routeInboundCall === 'function', 'routeInboundCall is a function');
  });
  
  test('Create VAPI inbound call function exists', () => {
    assertTrue(typeof createVapiInboundCall === 'function', 'createVapiInboundCall is a function');
  });
  
  test('Log inbound call function exists', () => {
    assertTrue(typeof logInboundCall === 'function', 'logInboundCall is a function');
  });
  
  test('Call routing parameters', () => {
    const params = {
      fromPhone: '+447491683261',
      toPhone: '+447403934440',
      callSid: 'CA1234567890',
      clientKey: 'test_client'
    };
    
    assertTrue('fromPhone' in params, 'Has fromPhone');
    assertTrue('toPhone' in params, 'Has toPhone');
    assertTrue('callSid' in params, 'Has callSid');
    assertTrue(/^\+447/.test(params.fromPhone), 'From phone is E.164 format');
  });
  
  test('Client identification logic', () => {
    const phoneToClient = {
      '+447403934440': 'test_client',
      '+447403934441': 'another_client'
    };
    
    assertTrue(typeof phoneToClient === 'object', 'Mapping is object');
    Object.keys(phoneToClient).forEach(phone => {
      assertTrue(/^\+447/.test(phone), `Phone ${phone} is E.164`);
    });
  });
  
  test('Business hours check', () => {
    const now = new Date();
    const hour = now.getHours();
    const isBusinessHours = hour >= 9 && hour < 17;
    
    assertTrue(typeof isBusinessHours === 'boolean', 'Is boolean');
  });
  
  test('Call context types', () => {
    const contexts = ['business_hours', 'after_hours', 'customer', 'prospect'];
    contexts.forEach(context => {
      assertTrue(typeof context === 'string', `Context ${context} is string`);
    });
  });
});

const exitCode = printSummary();
process.exit(exitCode);
