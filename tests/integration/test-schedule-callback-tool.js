// tests/integration/test-schedule-callback-tool.js
// Test schedule callback tool endpoint

import { describe, test, assertTrue, skipIf, printSummary, resetStats, httpRequest, checkServerAvailable } from '../utils/test-helpers.js';

resetStats();

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:10000';
const API_KEY = process.env.TEST_API_KEY || process.env.API_KEY;

describe('Schedule Callback Tool Tests', () => {
  
  test('Server availability check', async () => {
    const available = await checkServerAvailable(BASE_URL);
    skipIf(!available, 'Server not available');
    assertTrue(available, 'Server is available');
  });
  
  test('Schedule callback with full data', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const response = await httpRequest(`${BASE_URL}/tools/schedule_callback`, {
      method: 'POST',
      headers: {
        'X-API-Key': API_KEY
      },
      body: {
        businessName: 'Test Business',
        phone: '+447491683261',
        receptionistName: 'Sarah',
        reason: 'Decision maker not available',
        preferredTime: 'Tomorrow 2pm',
        notes: 'Call back for pricing discussion',
        tenantKey: 'logistics_client'
      }
    });
    
    assertTrue(response.ok || response.status === 200, 'Callback scheduled');
  });
  
  test('Error handling - missing required fields', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const response = await httpRequest(`${BASE_URL}/tools/schedule_callback`, {
      method: 'POST',
      headers: {
        'X-API-Key': API_KEY
      },
      body: {
        businessName: 'Test Business'
        // Missing phone and reason
      }
    });
    
    assertTrue(response.status >= 400 || !response.ok, 'Error returned for missing fields');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

