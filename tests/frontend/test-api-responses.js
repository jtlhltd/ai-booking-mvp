// tests/frontend/test-api-responses.js
// Test API response format validation

import { describe, test, assertTrue, skipIf, printSummary, resetStats, httpRequest, checkServerAvailable } from '../utils/test-helpers.js';

resetStats();

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:10000';

describe('API Response Format Tests', () => {
  
  test('Server availability check', async () => {
    const available = await checkServerAvailable(BASE_URL);
    skipIf(!available, 'Server not available');
    assertTrue(available, 'Server is available');
  });
  
  test('Response format validation', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const response = await httpRequest(`${BASE_URL}/health`);
    if (response.data && typeof response.data === 'object') {
      assertTrue('status' in response.data || 'ok' in response.data, 'Response has status/ok field');
    }
  });
});

const exitCode = printSummary();
process.exit(exitCode);

