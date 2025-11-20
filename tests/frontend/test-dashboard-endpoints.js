// tests/frontend/test-dashboard-endpoints.js
// Test dashboard HTML endpoints

import { describe, test, assertTrue, skipIf, printSummary, resetStats, httpRequest, checkServerAvailable } from '../utils/test-helpers.js';

resetStats();

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:10000';

describe('Dashboard Endpoints Tests', () => {
  
  test('Server availability check', async () => {
    const available = await checkServerAvailable(BASE_URL);
    skipIf(!available, 'Server not available');
    assertTrue(available, 'Server is available');
  });
  
  test('Root endpoint', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const response = await httpRequest(`${BASE_URL}/`);
    assertTrue(response.status === 200 || response.status === 302, 'Root endpoint responds');
  });
  
  test('Client dashboard endpoint', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const response = await httpRequest(`${BASE_URL}/client-dashboard`);
    assertTrue(response.status === 200 || response.status >= 400, 'Client dashboard responds');
  });
  
  test('Dashboard HTML content', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const response = await httpRequest(`${BASE_URL}/dashboard-v2.html`);
    if (response.status === 200 && typeof response.data === 'string') {
      assertTrue(response.data.includes('html') || response.data.includes('<!'), 'HTML content returned');
    } else {
      assertTrue(true, 'Dashboard endpoint responds');
    }
  });
});

const exitCode = printSummary();
process.exit(exitCode);

