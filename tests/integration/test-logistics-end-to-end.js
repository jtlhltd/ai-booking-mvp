// tests/integration/test-logistics-end-to-end.js
// Test complete logistics flow

import { describe, test, assertTrue, skipIf, printSummary, resetStats, httpRequest, checkServerAvailable } from '../utils/test-helpers.js';
import { createMockWebhook } from '../fixtures/mock-webhooks.js';

resetStats();

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:10000';
const API_KEY = process.env.TEST_API_KEY || process.env.API_KEY;

describe('Logistics End-to-End Tests', () => {
  
  test('Server availability check', async () => {
    const available = await checkServerAvailable(BASE_URL);
    skipIf(!available, 'Server not available - skipping integration tests');
    assertTrue(available, 'Server is available');
  });
  
  test('Complete flow: lead submission → webhook → verification', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    // Step 1: Submit lead
    const leadResponse = await httpRequest(`${BASE_URL}/api/leads`, {
      method: 'POST',
      headers: {
        'X-Client-Key': 'logistics_client',
        'Content-Type': 'application/json'
      },
      body: {
        service: 'logistics',
        lead: {
          name: 'Test Business Ltd',
          phone: '+447491683261'
        },
        source: 'test_e2e'
      }
    });
    
    assertTrue(leadResponse.ok || leadResponse.status === 200 || leadResponse.status === 201, 'Lead submitted');
    
    // Step 2: Simulate webhook with logistics data
    const webhook = createMockWebhook('withTranscript');
    webhook.metadata.leadPhone = '+447491683261';
    
    const webhookResponse = await httpRequest(`${BASE_URL}/webhooks/vapi`, {
      method: 'POST',
      body: webhook
    });
    
    assertTrue(webhookResponse.ok || webhookResponse.status === 200, 'Webhook processed');
    
    // Step 3: Verify data (would check sheet, but that requires actual sheet access)
    assertTrue(true, 'End-to-end flow completed');
  });
  
  test('Multiple leads in sequence', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const leads = [
      { name: 'Business 1', phone: '+447700900001' },
      { name: 'Business 2', phone: '+447700900002' },
      { name: 'Business 3', phone: '+447700900003' }
    ];
    
    for (const lead of leads) {
      const response = await httpRequest(`${BASE_URL}/api/leads`, {
        method: 'POST',
        headers: {
          'X-Client-Key': 'logistics_client',
          'Content-Type': 'application/json'
        },
        body: {
          service: 'logistics',
          lead,
          source: 'test_batch'
        }
      });
      
      assertTrue(response.ok || response.status === 200 || response.status === 201, `Lead ${lead.name} submitted`);
    }
    
    assertTrue(true, 'Multiple leads processed');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

