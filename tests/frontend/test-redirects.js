// tests/frontend/test-redirects.js
// Test URL redirects

import { describe, test, assertTrue, skipIf, printSummary, resetStats, httpRequest, checkServerAvailable } from '../utils/test-helpers.js';

resetStats();

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:10000';

describe('Redirects Tests', () => {
  
  test('Server availability check', async () => {
    const available = await checkServerAvailable(BASE_URL);
    skipIf(!available, 'Server not available');
    assertTrue(available, 'Server is available');
  });
  
  test('Redirect handling', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const response = await httpRequest(`${BASE_URL}/`, {
      followRedirects: false
    });
    
    // May redirect or return content
    assertTrue(response.status === 200 || response.status === 302, 'Redirect handled');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

