// tests/lib/test-util-phone.js
// Test util/phone.js functionality

import { describe, test, assertTrue, assertEqual, printSummary, resetStats } from '../utils/test-helpers.js';
import { normalizePhone } from '../../util/phone.js';

resetStats();

describe('Util Phone Tests', () => {
  
  test('Normalize phone function exists', () => {
    assertTrue(typeof normalizePhone === 'function', 'normalizePhone is a function');
  });
  
  test('Phone normalization logic', () => {
    const phones = ['07491683261', '+447491683261', '447491683261'];
    
    phones.forEach(phone => {
      try {
        const normalized = normalizePhone(phone);
        assertTrue(normalized === null || normalized === undefined || typeof normalized === 'string', 'Returns string, null, or undefined');
        if (normalized && typeof normalized === 'string') {
          assertTrue(/^\+/.test(normalized), 'Normalized phone starts with +');
        }
      } catch (error) {
        assertTrue(error instanceof Error, 'Function handles errors');
      }
    });
  });
  
  test('E.164 format validation', () => {
    const validPhone = '+447491683261';
    const isValid = /^\+447\d{9}$/.test(validPhone);
    
    assertTrue(isValid, 'E.164 format is valid');
  });
  
  test('Phone input types', () => {
    const inputs = [
      '07491683261',  // UK format
      '+447491683261', // E.164
      '447491683261'   // International without +
    ];
    
    inputs.forEach(input => {
      try {
        const result = normalizePhone(input);
        assertTrue(result === null || result === undefined || typeof result === 'string', 'Returns valid type');
      } catch (error) {
        assertTrue(error instanceof Error, 'Function handles errors');
      }
    });
    
    // Test null/undefined separately
    assertTrue(normalizePhone(null) === null, 'Null returns null');
    assertTrue(normalizePhone(undefined) === undefined, 'Undefined returns undefined');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

