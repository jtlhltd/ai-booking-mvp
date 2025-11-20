// tests/monitoring/test-health-checks.js
// Test system health checks

import { describe, test, assertTrue, skipIf, printSummary, resetStats, httpRequest, checkServerAvailable } from '../utils/test-helpers.js';

resetStats();

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:10000';

describe('Health Checks Tests', () => {
  
  test('Health endpoint', async () => {
    const available = await checkServerAvailable(BASE_URL);
    skipIf(!available, 'Server not available');
    
    const response = await httpRequest(`${BASE_URL}/health`);
    assertTrue(response.ok || response.status === 200, 'Health endpoint responds');
  });
  
  test('System health endpoint', async () => {
    const available = await checkServerAvailable(BASE_URL);
    skipIf(!available, 'Server not available');
    
    const response = await httpRequest(`${BASE_URL}/api/admin/system-health`, {
      headers: {
        'X-API-Key': process.env.TEST_API_KEY || process.env.API_KEY
      }
    });
    
    assertTrue(response.ok || response.status === 200, 'System health responds');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

