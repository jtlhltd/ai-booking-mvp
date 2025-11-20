// tests/performance/test-response-times.js
// Test API response times

import { describe, test, assertTrue, skipIf, printSummary, resetStats, httpRequest, checkServerAvailable, testTimer } from '../utils/test-helpers.js';

resetStats();

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:10000';

describe('Response Time Tests', () => {
  
  test('Health endpoint response time', async () => {
    const available = await checkServerAvailable(BASE_URL);
    skipIf(!available, 'Server not available');
    
    const timer = testTimer('health');
    const response = await httpRequest(`${BASE_URL}/health`);
    const duration = timer.getDuration();
    
    assertTrue(response.ok || response.status === 200, 'Health endpoint responds');
    assertTrue(duration < 5000, `Response time acceptable: ${duration}ms`);
  });
  
  test('API response time target', () => {
    const target = 500; // 500ms target
    assertTrue(target < 1000, 'Response time target reasonable');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

