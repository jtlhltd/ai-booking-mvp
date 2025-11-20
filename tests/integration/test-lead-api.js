// tests/integration/test-lead-api.js
// Test lead API endpoints

import { describe, test, assertTrue, skipIf, printSummary, resetStats, httpRequest, checkServerAvailable } from '../utils/test-helpers.js';

resetStats();

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:10000';
const CLIENT_KEY = process.env.TEST_CLIENT_KEY || 'logistics_client';

describe('Lead API Integration Tests', () => {
  
  test('Server availability check', async () => {
    const available = await checkServerAvailable(BASE_URL);
    skipIf(!available, 'Server not available');
    assertTrue(available, 'Server is available');
  });
  
  test('Create lead', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const response = await httpRequest(`${BASE_URL}/api/leads`, {
      method: 'POST',
      headers: {
        'X-Client-Key': CLIENT_KEY,
        'Content-Type': 'application/json'
      },
      body: {
        service: 'logistics',
        lead: {
          name: 'Test Lead',
          phone: '+447491683261'
        },
        source: 'test'
      }
    });
    
    assertTrue(response.ok || response.status === 200 || response.status === 201, 'Lead created');
    if (response.data) {
      assertTrue(response.data.ok !== false, 'Response indicates success');
    }
  });
  
  test('Create lead - missing required fields', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const response = await httpRequest(`${BASE_URL}/api/leads`, {
      method: 'POST',
      headers: {
        'X-Client-Key': CLIENT_KEY,
        'Content-Type': 'application/json'
      },
      body: {
        service: 'logistics'
        // Missing lead.name and lead.phone
      }
    });
    
    assertTrue(response.status >= 400 || !response.ok, 'Error returned for missing fields');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

