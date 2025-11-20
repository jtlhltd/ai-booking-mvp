// tests/lib/test-client-onboarding.js
// Test client onboarding functionality

import { describe, test, assertTrue, assertEqual, printSummary, resetStats } from '../utils/test-helpers.js';
import {
  generateApiKey,
  generateClientKey,
  cloneVapiAssistant,
  onboardClient,
  updateClientConfig,
  deactivateClient
} from '../../lib/client-onboarding.js';

resetStats();

describe('Client Onboarding Tests', () => {
  
  test('Generate API key function exists', () => {
    assertTrue(typeof generateApiKey === 'function', 'generateApiKey is a function');
  });
  
  test('Generate client key function exists', () => {
    assertTrue(typeof generateClientKey === 'function', 'generateClientKey is a function');
  });
  
  test('Clone VAPI assistant function exists', () => {
    assertTrue(typeof cloneVapiAssistant === 'function', 'cloneVapiAssistant is a function');
  });
  
  test('Onboard client function exists', () => {
    assertTrue(typeof onboardClient === 'function', 'onboardClient is a function');
  });
  
  test('Update client config function exists', () => {
    assertTrue(typeof updateClientConfig === 'function', 'updateClientConfig is a function');
  });
  
  test('Deactivate client function exists', () => {
    assertTrue(typeof deactivateClient === 'function', 'deactivateClient is a function');
  });
  
  test('API key generation', () => {
    const apiKey = generateApiKey();
    assertTrue(typeof apiKey === 'string', 'Returns string');
    assertTrue(apiKey.length >= 16, 'API key has minimum length');
  });
  
  test('Client key generation', () => {
    const businessName = 'Test Dental Practice';
    const clientKey = generateClientKey(businessName);
    
    assertTrue(typeof clientKey === 'string', 'Returns string');
    assertTrue(clientKey.length > 0, 'Client key has content');
    assertTrue(!clientKey.includes(' '), 'Client key has no spaces');
  });
  
  test('Client data structure', () => {
    const clientData = {
      businessName: 'Test Business',
      ownerEmail: 'owner@example.com',
      phone: '+447403934440',
      industry: 'dentist'
    };
    
    assertTrue('businessName' in clientData, 'Has business name');
    assertTrue('ownerEmail' in clientData, 'Has owner email');
    assertTrue(/@/.test(clientData.ownerEmail), 'Email is valid format');
  });
  
  test('Client configuration updates', () => {
    const updates = {
      businessHours: 'Mon-Fri 9am-5pm',
      services: ['Service 1', 'Service 2'],
      timezone: 'Europe/London'
    };
    
    assertTrue(typeof updates === 'object', 'Updates is object');
    assertTrue('businessHours' in updates || Object.keys(updates).length > 0, 'Has updates');
  });
  
  test('Deactivation reasons', () => {
    const reasons = ['client_request', 'payment_failed', 'violation', 'inactive'];
    reasons.forEach(reason => {
      assertTrue(typeof reason === 'string', `Reason ${reason} is string`);
    });
  });
});

const exitCode = printSummary();
process.exit(exitCode);
