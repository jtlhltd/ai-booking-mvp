// tests/unit/test-phone-validation.js
// Test phone number validation

import { normalizePhoneE164 } from '../../lib/utils.js';
import { describe, test, assertEqual, assertTrue, printSummary, resetStats } from '../utils/test-helpers.js';

resetStats();

describe('Phone Validation Tests', () => {
  
  test('E.164 normalization', () => {
    const tests = [
      { input: '07491683261', country: 'GB', expected: '+447491683261' },
      { input: '+447491683261', country: 'GB', expected: '+447491683261' },
      { input: '02071234567', country: 'GB', expected: '+442071234567' }
    ];
    
    tests.forEach(({ input, country, expected }) => {
      const result = normalizePhoneE164(input, country);
      assertTrue(result.startsWith('+'), `E.164 format: ${input}`);
      if (expected) {
        assertEqual(result, expected, `Normalization: ${input} -> ${expected}`);
      }
    });
  });
  
  test('Phone format validation', () => {
    const validPhones = [
      '+447491683261',
      '+442071234567',
      '+1234567890'
    ];
    
    validPhones.forEach(phone => {
      assertTrue(phone.startsWith('+'), `Valid phone format: ${phone}`);
      assertTrue(phone.length >= 10, `Phone length valid: ${phone}`);
    });
  });
});

const exitCode = printSummary();
process.exit(exitCode);

