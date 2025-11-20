// tests/routes/test-leads-routes.js
// Test leads route endpoints

import { describe, test, assertTrue, skipIf, printSummary, resetStats, httpRequest, checkServerAvailable } from '../utils/test-helpers.js';

resetStats();

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:10000';
const CLIENT_KEY = process.env.TEST_CLIENT_KEY || 'logistics_client';

describe('Leads Routes Tests', () => {
  
  test('Server availability check', async () => {
    const available = await checkServerAvailable(BASE_URL);
    skipIf(!available, 'Server not available');
    assertTrue(available, 'Server is available');
  });
  
  test('Create lead via route', async () => {
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
          name: 'Route Test Lead',
          phone: '+447700900100'
        },
        source: 'route_test'
      }
    });
    
    assertTrue(response.ok || response.status === 200 || response.status === 201, 'Lead created via route');
  });
  
  test('Route authentication', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const response = await httpRequest(`${BASE_URL}/api/leads`, {
      method: 'POST',
      body: {
        service: 'logistics',
        lead: {
          name: 'Test',
          phone: '+447491683261'
        }
      }
    });
    
    // Should require authentication
    assertTrue(response.status >= 400 || !response.ok, 'Authentication required');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

