// tests/admin/test-admin-analytics.js
// Test admin analytics endpoints

import { describe, test, assertTrue, skipIf, printSummary, resetStats, httpRequest, checkServerAvailable } from '../utils/test-helpers.js';

resetStats();

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:10000';
const API_KEY = process.env.TEST_API_KEY || process.env.API_KEY;

describe('Admin Analytics Tests', () => {
  
  test('Server availability check', async () => {
    const available = await checkServerAvailable(BASE_URL);
    skipIf(!available, 'Server not available');
    assertTrue(available, 'Server is available');
  });
  
  test('Get analytics', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const response = await httpRequest(`${BASE_URL}/api/admin/analytics`, {
      method: 'GET',
      headers: {
        'X-API-Key': API_KEY
      }
    });
    
    assertTrue(response.ok || response.status === 200, 'Analytics retrieved');
  });
  
  test('Get advanced analytics', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const response = await httpRequest(`${BASE_URL}/api/admin/analytics/advanced`, {
      method: 'GET',
      headers: {
        'X-API-Key': API_KEY
      }
    });
    
    assertTrue(response.ok || response.status === 200, 'Advanced analytics retrieved');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

