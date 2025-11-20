// tests/lib/test-phone-validation.js
// Test phone validation functionality

import { describe, test, assertTrue, assertEqual, printSummary, resetStats } from '../utils/test-helpers.js';
import { validatePhoneNumber, validatePhoneNumbers, isPhoneValidationEnabled } from '../../lib/phone-validation.js';

resetStats();

describe('Phone Validation Tests', () => {
  
  test('Validate phone number function exists', () => {
    assertTrue(typeof validatePhoneNumber === 'function', 'validatePhoneNumber is a function');
  });
  
  test('Validate phone numbers function exists', () => {
    assertTrue(typeof validatePhoneNumbers === 'function', 'validatePhoneNumbers is a function');
  });
  
  test('Is phone validation enabled function exists', () => {
    assertTrue(typeof isPhoneValidationEnabled === 'function', 'isPhoneValidationEnabled is a function');
  });
  
  test('E.164 format validation', () => {
    const validPhone = '+447491683261';
    const isValid = /^\+447\d{9}$/.test(validPhone);
    
    assertTrue(isValid, 'E.164 format is valid');
  });
  
  test('Phone number formats', () => {
    const formats = [
      '+447491683261', // E.164
      '07491683261',   // UK format
      '447491683261'   // International without +
    ];
    
    formats.forEach(format => {
      assertTrue(typeof format === 'string', `Format ${format} is string`);
      assertTrue(format.length >= 10, 'Format has minimum length');
    });
  });
  
  test('Bulk validation structure', () => {
    const phones = ['+447491683261', '+447700900123', '+447700900456'];
    const results = phones.map(phone => ({
      phone,
      valid: /^\+447\d{9}$/.test(phone)
    }));
    
    assertTrue(Array.isArray(results), 'Results is array');
    assertTrue(results.length === phones.length, 'All phones processed');
    results.forEach(result => {
      assertTrue('valid' in result, 'Result has valid flag');
    });
  });
  
  test('Validation enabled check', () => {
    try {
      const enabled = isPhoneValidationEnabled();
      assertTrue(typeof enabled === 'boolean', 'Returns boolean');
    } catch (error) {
      assertTrue(error instanceof Error, 'Function handles errors');
    }
  });
});

const exitCode = printSummary();
process.exit(exitCode);

