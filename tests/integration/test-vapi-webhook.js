// tests/integration/test-vapi-webhook.js
// Test VAPI webhook processing

import { describe, test, assertEqual, assertTrue, skipIf, printSummary, resetStats, httpRequest, checkServerAvailable } from '../utils/test-helpers.js';
import { createMockWebhook } from '../fixtures/mock-webhooks.js';

resetStats();

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:10000';

describe('VAPI Webhook Integration Tests', () => {
  
  test('Server availability check', async () => {
    const available = await checkServerAvailable(BASE_URL);
    skipIf(!available, 'Server not available - skipping integration tests');
    assertTrue(available, 'Server is available');
  });
  
  test('Webhook with transcript', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const webhook = createMockWebhook('withTranscript');
    const response = await httpRequest(`${BASE_URL}/webhooks/vapi`, {
      method: 'POST',
      body: webhook
    });
    
    assertTrue(response.ok || response.status === 200, 'Webhook accepted');
    if (response.data) {
      assertTrue(response.data.ok !== false, 'Webhook processed successfully');
    }
  });
  
  test('Webhook with structured output', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const webhook = createMockWebhook('withStructuredOutput');
    const response = await httpRequest(`${BASE_URL}/webhooks/vapi`, {
      method: 'POST',
      body: webhook
    });
    
    assertTrue(response.ok || response.status === 200, 'Structured output webhook accepted');
  });
  
  test('Webhook with tool calls', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const webhook = createMockWebhook('withToolCalls');
    const response = await httpRequest(`${BASE_URL}/webhooks/vapi`, {
      method: 'POST',
      body: webhook
    });
    
    assertTrue(response.ok || response.status === 200, 'Tool calls webhook accepted');
  });
  
  test('Webhook with callback tool', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const webhook = createMockWebhook('withCallbackTool');
    const response = await httpRequest(`${BASE_URL}/webhooks/vapi`, {
      method: 'POST',
      body: webhook
    });
    
    assertTrue(response.ok || response.status === 200, 'Callback tool webhook accepted');
  });
  
  test('Webhook - no answer outcome', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const webhook = createMockWebhook('noAnswer');
    const response = await httpRequest(`${BASE_URL}/webhooks/vapi`, {
      method: 'POST',
      body: webhook
    });
    
    assertTrue(response.ok || response.status === 200, 'No answer webhook accepted');
  });
  
  test('Webhook - voicemail outcome', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const webhook = createMockWebhook('voicemail');
    const response = await httpRequest(`${BASE_URL}/webhooks/vapi`, {
      method: 'POST',
      body: webhook
    });
    
    assertTrue(response.ok || response.status === 200, 'Voicemail webhook accepted');
  });
  
  test('Webhook - booked outcome', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const webhook = createMockWebhook('booked');
    const response = await httpRequest(`${BASE_URL}/webhooks/vapi`, {
      method: 'POST',
      body: webhook
    });
    
    assertTrue(response.ok || response.status === 200, 'Booked webhook accepted');
  });
  
  test('Webhook deduplication', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const webhook = createMockWebhook('default');
    const callId = webhook.call.id;
    
    // Send same webhook twice
    const response1 = await httpRequest(`${BASE_URL}/webhooks/vapi`, {
      method: 'POST',
      body: webhook
    });
    
    const response2 = await httpRequest(`${BASE_URL}/webhooks/vapi`, {
      method: 'POST',
      body: webhook
    });
    
    assertTrue(response1.ok || response1.status === 200, 'First webhook accepted');
    assertTrue(response2.ok || response2.status === 200, 'Second webhook accepted (deduplication handled)');
  });
  
  test('Webhook - short transcript handling', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const webhook = createMockWebhook('shortTranscript');
    const response = await httpRequest(`${BASE_URL}/webhooks/vapi`, {
      method: 'POST',
      body: webhook
    });
    
    assertTrue(response.ok || response.status === 200, 'Short transcript webhook handled');
  });
  
  test('Webhook - no transcript handling', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const webhook = createMockWebhook('noTranscript');
    const response = await httpRequest(`${BASE_URL}/webhooks/vapi`, {
      method: 'POST',
      body: webhook
    });
    
    assertTrue(response.ok || response.status === 200, 'No transcript webhook handled');
  });
  
  test('Webhook with message envelope', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const webhook = createMockWebhook('withMessageEnvelope');
    const response = await httpRequest(`${BASE_URL}/webhooks/vapi`, {
      method: 'POST',
      body: webhook
    });
    
    assertTrue(response.ok || response.status === 200, 'Message envelope webhook handled');
  });

  test('Webhook - end-of-call-report with endedReason (no outcome)', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');

    const webhook = createMockWebhook('endOfCallReportNoAnswer');
    const response = await httpRequest(`${BASE_URL}/webhooks/vapi`, {
      method: 'POST',
      body: webhook
    });

    assertTrue(response.ok || response.status === 200, 'End-of-call-report webhook accepted');
    if (response.data) {
      assertTrue(response.data.ok !== false, 'End-of-call-report processed successfully');
    }
  });

  test('Webhook - end-of-call-report voicemail', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');

    const webhook = createMockWebhook('endOfCallReportVoicemail');
    const response = await httpRequest(`${BASE_URL}/webhooks/vapi`, {
      method: 'POST',
      body: webhook
    });

    assertTrue(response.ok || response.status === 200, 'End-of-call-report voicemail accepted');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

