// tests/routes/test-health-routes.js
// Test health route endpoints

import { describe, test, assertTrue, skipIf, printSummary, resetStats, httpRequest, checkServerAvailable } from '../utils/test-helpers.js';

resetStats();

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:10000';

describe('Health Routes Tests', () => {
  
  test('Health endpoint', async () => {
    const available = await checkServerAvailable(BASE_URL);
    skipIf(!available, 'Server not available');
    
    const response = await httpRequest(`${BASE_URL}/health`);
    assertTrue(response.ok || response.status === 200, 'Health endpoint responds');
    if (response.data) {
      assertTrue(typeof response.data === 'object', 'Health data returned');
    }
  });
});

const exitCode = printSummary();
process.exit(exitCode);

