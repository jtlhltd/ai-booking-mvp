// tests/routes/test-twilio-webhooks.js
// Test Twilio webhook routes

import { describe, test, assertTrue, skipIf, printSummary, resetStats, httpRequest, checkServerAvailable } from '../utils/test-helpers.js';

resetStats();

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:10000';

describe('Twilio Webhooks Routes Tests', () => {
  
  test('Server availability check', async () => {
    const available = await checkServerAvailable(BASE_URL);
    skipIf(!available, 'Server not available');
    assertTrue(available, 'Server is available');
  });
  
  test('SMS inbound - START message', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const response = await httpRequest(`${BASE_URL}/webhooks/twilio/sms-inbound`, {
      method: 'POST',
      body: {
        From: '+447491683261',
        To: '+447403934440',
        Body: 'START',
        MessageSid: 'SM123',
        MessagingServiceSid: 'MG123'
      }
    });
    
    assertTrue(response.ok || response.status === 200, 'START message processed');
  });
  
  test('SMS inbound - STOP message', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const response = await httpRequest(`${BASE_URL}/webhooks/twilio/sms-inbound`, {
      method: 'POST',
      body: {
        From: '+447491683261',
        To: '+447403934440',
        Body: 'STOP',
        MessageSid: 'SM124',
        MessagingServiceSid: 'MG123'
      }
    });
    
    assertTrue(response.ok || response.status === 200, 'STOP message processed');
  });
  
  test('SMS inbound - opt-out handling', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const response = await httpRequest(`${BASE_URL}/webhooks/twilio/sms-inbound`, {
      method: 'POST',
      body: {
        From: '+447491683261',
        To: '+447403934440',
        Body: 'STOP',
        MessageSid: 'SM125',
        MessagingServiceSid: 'MG123'
      }
    });
    
    assertTrue(response.ok || response.status === 200, 'Opt-out handled');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

