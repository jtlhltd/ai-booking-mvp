// tests/integration/test-call-tracking.js
// Test call tracking functionality

import { describe, test, assertTrue, skipIf, printSummary, resetStats, httpRequest, checkServerAvailable } from '../utils/test-helpers.js';
import { createMockWebhook } from '../fixtures/mock-webhooks.js';

resetStats();

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:10000';

describe('Call Tracking Tests', () => {
  
  test('Server availability check', async () => {
    const available = await checkServerAvailable(BASE_URL);
    skipIf(!available, 'Server not available');
    assertTrue(available, 'Server is available');
  });
  
  test('Call tracking via webhook', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const webhook = createMockWebhook('default');
    const response = await httpRequest(`${BASE_URL}/webhooks/vapi`, {
      method: 'POST',
      body: webhook
    });
    
    assertTrue(response.ok || response.status === 200, 'Call tracked via webhook');
  });
  
  test('Call quality metrics storage', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const webhook = createMockWebhook('withTranscript');
    webhook.call.metrics = {
      talk_time_ratio: 0.7,
      interruptions: 2,
      quality_score: 8
    };
    
    const response = await httpRequest(`${BASE_URL}/webhooks/vapi`, {
      method: 'POST',
      body: webhook
    });
    
    assertTrue(response.ok || response.status === 200, 'Quality metrics stored');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

