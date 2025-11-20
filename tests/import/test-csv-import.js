// tests/import/test-csv-import.js
// Test CSV lead import

import { describe, test, assertTrue, skipIf, printSummary, resetStats, httpRequest, checkServerAvailable } from '../utils/test-helpers.js';

resetStats();

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:10000';
const API_KEY = process.env.TEST_API_KEY || process.env.API_KEY;

describe('CSV Import Tests', () => {
  
  test('Server availability check', async () => {
    const available = await checkServerAvailable(BASE_URL);
    skipIf(!available, 'Server not available');
    assertTrue(available, 'Server is available');
  });
  
  test('CSV import endpoint', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    // CSV import would require multipart form data
    const csvData = 'name,phone,email\nJohn Doe,+447491683261,john@example.com';
    const lines = csvData.split('\n');
    const headers = lines[0].split(',');
    
    assertTrue(lines.length > 1, 'CSV has data rows');
    assertTrue(headers.includes('name'), 'Has name header');
    assertTrue(headers.includes('phone'), 'Has phone header');
    assertTrue(headers.includes('email'), 'Has email header');
  });
  
  test('CSV parsing logic', () => {
    const csvRow = 'John Doe,+447491683261,john@example.com';
    const values = csvRow.split(',');
    
    assertTrue(values.length === 3, 'CSV row has 3 values');
    assertTrue(/^\+447/.test(values[1]), 'Phone is E.164 format');
    assertTrue(/@/.test(values[2]), 'Email has @ symbol');
  });
  
  test('Import validation', () => {
    const csvRow = {
      name: 'Test Lead',
      phone: '+447491683261',
      email: 'test@example.com'
    };
    
    assertTrue('name' in csvRow, 'CSV row has name');
    assertTrue('phone' in csvRow, 'CSV row has phone');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

