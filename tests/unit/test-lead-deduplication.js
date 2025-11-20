// tests/unit/test-lead-deduplication.js
// Test lead deduplication and UK phone validation

import { validateUKPhone } from '../../lib/lead-deduplication.js';
import { describe, test, assertEqual, assertTrue, printSummary, resetStats } from '../utils/test-helpers.js';

resetStats();

describe('Lead Deduplication Tests', () => {
  
  test('UK phone validation - mobile', () => {
    const mobileTests = [
      { phone: '+447491683261', expected: { valid: true, type: 'mobile' } },
      { phone: '07491683261', expected: { valid: true, type: 'mobile' } },
      { phone: '07491 683 261', expected: { valid: true, type: 'mobile' } },
      { phone: '(07491) 683261', expected: { valid: true, type: 'mobile' } }
    ];
    
    mobileTests.forEach(({ phone, expected }) => {
      const result = validateUKPhone(phone);
      assertEqual(result.valid, expected.valid, `Mobile validation: ${phone}`);
      if (result.valid) {
        assertEqual(result.type, expected.type, `Mobile type: ${phone}`);
        assertTrue(result.normalized.startsWith('+44'), `Normalized starts with +44: ${phone}`);
      }
    });
  });
  
  test('UK phone validation - landline', () => {
    const landlineTests = [
      { phone: '+442071234567', expected: { valid: true, type: 'landline' } },
      { phone: '02071234567', expected: { valid: true, type: 'landline' } },
      { phone: '020 7123 4567', expected: { valid: true, type: 'landline' } }
    ];
    
    landlineTests.forEach(({ phone, expected }) => {
      const result = validateUKPhone(phone);
      assertEqual(result.valid, expected.valid, `Landline validation: ${phone}`);
      if (result.valid) {
        assertEqual(result.type, expected.type, `Landline type: ${phone}`);
      }
    });
  });
  
  test('UK phone validation - invalid', () => {
    const invalidTests = [
      '123',
      'abc',
      '123456789',
      '',
      null,
      undefined
    ];
    
    invalidTests.forEach(phone => {
      const result = validateUKPhone(phone);
      assertEqual(result.valid, false, `Invalid phone rejected: ${phone}`);
    });
  });
  
  test('UK phone validation - international', () => {
    const result = validateUKPhone('+1234567890');
    assertEqual(result.valid, true, 'International number accepted');
    assertEqual(result.type, 'international', 'International type detected');
  });
  
  test('Phone normalization', () => {
    const result = validateUKPhone('07491683261');
    assertTrue(result.normalized.startsWith('+44'), 'Phone normalized to +44 format');
    assertTrue(result.normalized.length === 13, 'Normalized length correct');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

