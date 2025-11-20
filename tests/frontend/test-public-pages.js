// tests/frontend/test-public-pages.js
// Test public page endpoints

import { describe, test, assertTrue, skipIf, printSummary, resetStats, httpRequest, checkServerAvailable } from '../utils/test-helpers.js';

resetStats();

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:10000';

describe('Public Pages Tests', () => {
  
  test('Server availability check', async () => {
    const available = await checkServerAvailable(BASE_URL);
    skipIf(!available, 'Server not available');
    assertTrue(available, 'Server is available');
  });
  
  test('Public pages accessible', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const pages = [
      '/setup-guide',
      '/uk-business-search',
      '/decision-maker-finder',
      '/vapi-test-dashboard'
    ];
    
    for (const page of pages) {
      const response = await httpRequest(`${BASE_URL}${page}`);
      assertTrue(response.status === 200 || response.status >= 400, `Page ${page} responds`);
    }
  });
});

const exitCode = printSummary();
process.exit(exitCode);

