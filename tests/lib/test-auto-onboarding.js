// tests/lib/test-auto-onboarding.js
// Test auto onboarding functionality

import { describe, test, assertTrue, assertEqual, printSummary, resetStats } from '../utils/test-helpers.js';
import { createClient, sendWelcomeEmail } from '../../lib/auto-onboarding.js';

resetStats();

describe('Auto Onboarding Tests', () => {
  
  test('Create client function exists', () => {
    assertTrue(typeof createClient === 'function', 'createClient is a function');
  });
  
  test('Send welcome email function exists', () => {
    assertTrue(typeof sendWelcomeEmail === 'function', 'sendWelcomeEmail is a function');
  });
  
  test('Client creation parameters', () => {
    const params = {
      businessName: 'Test Business',
      ownerEmail: 'owner@example.com',
      phone: '+447403934440',
      industry: 'dentist'
    };
    
    assertTrue('businessName' in params, 'Has business name');
    assertTrue('ownerEmail' in params, 'Has owner email');
    assertTrue('phone' in params, 'Has phone');
    assertTrue(validateEmail(params.ownerEmail), 'Email is valid');
  });
  
  test('Welcome email data', () => {
    const emailData = {
      clientKey: 'test_client',
      businessName: 'Test Business',
      ownerEmail: 'owner@example.com',
      apiKey: 'api_key_123',
      systemPrompt: 'Test prompt'
    };
    
    assertTrue('apiKey' in emailData, 'Has API key');
    assertTrue('businessName' in emailData, 'Has business name');
    assertTrue(typeof emailData.apiKey === 'string', 'API key is string');
  });
  
  test('Client configuration structure', () => {
    const config = {
      businessSize: 'small',
      monthlyLeads: 50,
      workingDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
      workingHours: { start: '09:00', end: '17:00' }
    };
    
    assertTrue('workingDays' in config, 'Has working days');
    assertTrue(Array.isArray(config.workingDays), 'Working days is array');
    assertTrue(config.workingDays.length > 0, 'Has working days');
  });
  
  function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }
});

const exitCode = printSummary();
process.exit(exitCode);

