// tests/routes/test-twilio-voice-webhooks.js
// Test Twilio voice webhook routes

import { describe, test, assertTrue, skipIf, printSummary, resetStats, httpRequest, checkServerAvailable } from '../utils/test-helpers.js';

resetStats();

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:10000';

describe('Twilio Voice Webhooks Tests', () => {
  
  test('Server availability check', async () => {
    const available = await checkServerAvailable(BASE_URL);
    skipIf(!available, 'Server not available');
    assertTrue(available, 'Server is available');
  });
  
  test('Voicemail webhook', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const response = await httpRequest(`${BASE_URL}/webhooks/twilio-voice-recording`, {
      method: 'POST',
      body: {
        CallSid: 'CA123',
        RecordingUrl: 'https://api.twilio.com/recordings/RE123',
        From: '+447491683261',
        To: '+447403934440'
      }
    });
    
    assertTrue(response.ok || response.status === 200, 'Voicemail webhook processed');
  });
  
  test('Callback webhook', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const response = await httpRequest(`${BASE_URL}/webhooks/twilio-voice-callback`, {
      method: 'POST',
      body: {
        CallSid: 'CA123',
        Digits: '1',
        From: '+447491683261',
        To: '+447403934440'
      }
    });
    
    assertTrue(response.ok || response.status === 200, 'Callback webhook processed');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

