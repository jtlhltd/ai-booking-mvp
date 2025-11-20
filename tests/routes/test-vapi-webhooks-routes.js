// tests/routes/test-vapi-webhooks-routes.js
// Test VAPI webhooks route-level functionality

import { describe, test, assertTrue, skipIf, printSummary, resetStats, httpRequest, checkServerAvailable } from '../utils/test-helpers.js';
import { createMockWebhook } from '../fixtures/mock-webhooks.js';

resetStats();

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:10000';

describe('VAPI Webhooks Routes Tests', () => {
  
  test('Server availability check', async () => {
    const available = await checkServerAvailable(BASE_URL);
    skipIf(!available, 'Server not available');
    assertTrue(available, 'Server is available');
  });
  
  test('Route accepts webhook', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const webhook = createMockWebhook('default');
    const response = await httpRequest(`${BASE_URL}/webhooks/vapi`, {
      method: 'POST',
      body: webhook
    });
    
    assertTrue(response.ok || response.status === 200, 'Route accepts webhook');
  });
  
  test('Route processes different webhook types', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const scenarios = ['withTranscript', 'withStructuredOutput', 'withToolCalls', 'noAnswer'];
    
    for (const scenario of scenarios) {
      const webhook = createMockWebhook(scenario);
      const response = await httpRequest(`${BASE_URL}/webhooks/vapi`, {
        method: 'POST',
        body: webhook
      });
      
      assertTrue(response.ok || response.status === 200, `Route handles ${scenario}`);
    }
  });
});

const exitCode = printSummary();
process.exit(exitCode);

