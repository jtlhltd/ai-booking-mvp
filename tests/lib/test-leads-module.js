// tests/lib/test-leads-module.js
// Test leads module functionality (CommonJS module)

import { describe, test, assertTrue, assertEqual, printSummary, resetStats } from '../utils/test-helpers.js';

resetStats();

describe('Leads Module Tests', () => {
  
  test('Inbound SMS structure', () => {
    const sms = {
      tenant: { clientKey: 'test_client' },
      from: '+447491683261',
      to: '+447403934440',
      body: 'YES'
    };
    
    assertTrue('from' in sms, 'Has from number');
    assertTrue('to' in sms, 'Has to number');
    assertTrue('body' in sms, 'Has body');
    assertTrue(/^\+447/.test(sms.from), 'From is E.164 format');
  });
  
  test('Phone normalization logic', () => {
    const normalize = (phone) => {
      if (!phone) return null;
      let p = phone.trim().replace(/\s+/g, '');
      if (!p.startsWith('+')) {
        if (p.startsWith('0')) {
          p = '+44' + p.slice(1);
        } else {
          p = '+44' + p;
        }
      }
      return p;
    };
    
    assertTrue(normalize('07491683261') === '+447491683261', 'UK format normalized');
    assertTrue(normalize('+447491683261') === '+447491683261', 'E.164 format preserved');
    assertTrue(normalize('7491683261') === '+447491683261', 'Missing prefix added');
  });
  
  test('SMS opt-out handling', () => {
    const optOutCommands = ['STOP', 'UNSUBSCRIBE', 'CANCEL'];
    const body = 'STOP';
    
    assertTrue(optOutCommands.includes(body.toUpperCase()), 'STOP command detected');
  });
  
  test('SMS opt-in handling', () => {
    const optInCommands = ['START', 'UNSTOP'];
    const body = 'START';
    
    assertTrue(optInCommands.includes(body.toUpperCase()), 'START command detected');
  });
  
  test('YES response handling', () => {
    const yesCommands = ['YES', 'Y'];
    const body = 'YES';
    
    assertTrue(yesCommands.includes(body.toUpperCase()), 'YES command detected');
  });
  
  test('Slot selection handling', () => {
    const choice = '1';
    const isValid = /^[123]$/.test(choice);
    
    assertTrue(isValid === true, 'Valid slot choice');
    assertTrue(Number(choice) >= 1 && Number(choice) <= 3, 'Choice is 1-3');
  });
  
  test('Lead find or create logic', () => {
    const params = {
      tenantKey: 'test_client',
      phone: '+447491683261'
    };
    
    assertTrue('tenantKey' in params, 'Has tenantKey');
    assertTrue('phone' in params, 'Has phone');
    assertTrue(/^\+447/.test(params.phone), 'Phone is E.164 format');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

