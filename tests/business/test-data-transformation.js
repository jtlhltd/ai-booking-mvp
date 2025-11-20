// tests/business/test-data-transformation.js
// Test data format conversions

import { describe, test, assertTrue, assertEqual, printSummary, resetStats } from '../utils/test-helpers.js';

resetStats();

describe('Data Transformation Tests', () => {
  
  test('Date to ISO string', () => {
    const date = new Date('2025-01-15T10:00:00Z');
    const iso = date.toISOString();
    assertTrue(iso.includes('2025-01-15'), 'Date converted to ISO');
    assertTrue(iso.endsWith('Z'), 'ISO string ends with Z');
  });
  
  test('Phone normalization', () => {
    const phone = '07491683261';
    const normalized = phone.startsWith('+44') ? phone : '+44' + phone.substring(1);
    assertTrue(normalized.startsWith('+44'), 'Phone normalized to +44');
  });
  
  test('Array to comma-separated', () => {
    const array = ['DHL', 'FedEx', 'UPS'];
    const joined = array.join(', ');
    assertEqual(joined, 'DHL, FedEx, UPS', 'Array joined correctly');
  });
  
  test('Object to JSON', () => {
    const obj = { name: 'Test', value: 123 };
    const json = JSON.stringify(obj);
    assertTrue(json.includes('Test'), 'Object converted to JSON');
    assertTrue(json.includes('123'), 'Values in JSON');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

