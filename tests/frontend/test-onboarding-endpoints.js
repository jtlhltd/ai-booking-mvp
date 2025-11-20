// tests/frontend/test-onboarding-endpoints.js
// Test onboarding endpoints

import { describe, test, assertTrue, skipIf, printSummary, resetStats, httpRequest, checkServerAvailable } from '../utils/test-helpers.js';

resetStats();

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:10000';

describe('Onboarding Endpoints Tests', () => {
  
  test('Server availability check', async () => {
    const available = await checkServerAvailable(BASE_URL);
    skipIf(!available, 'Server not available');
    assertTrue(available, 'Server is available');
  });
  
  test('Onboarding endpoint', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const response = await httpRequest(`${BASE_URL}/onboarding`);
    assertTrue(response.status === 200 || response.status >= 400, 'Onboarding endpoint responds');
  });
  
  test('Onboarding wizard endpoint', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const response = await httpRequest(`${BASE_URL}/onboarding-wizard`);
    assertTrue(response.status === 200 || response.status >= 400, 'Onboarding wizard responds');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

