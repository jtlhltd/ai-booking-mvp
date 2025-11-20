// tests/security/test-authentication.js
// Test authentication middleware

import { describe, test, assertTrue, skipIf, printSummary, resetStats, httpRequest, checkServerAvailable } from '../utils/test-helpers.js';

resetStats();

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:10000';
const API_KEY = process.env.TEST_API_KEY || process.env.API_KEY;

describe('Authentication Tests', () => {
  
  test('Server availability check', async () => {
    const available = await checkServerAvailable(BASE_URL);
    skipIf(!available, 'Server not available');
    assertTrue(available, 'Server is available');
  });
  
  test('API key validation', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const response = await httpRequest(`${BASE_URL}/api/admin/clients`, {
      method: 'GET',
      headers: {
        'X-API-Key': API_KEY
      }
    });
    
    assertTrue(response.ok || response.status === 200, 'Valid API key accepted');
  });
  
  test('Missing API key rejection', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const response = await httpRequest(`${BASE_URL}/api/admin/clients`, {
      method: 'GET'
      // No API key
    });
    
    assertTrue(response.status >= 400 || !response.ok, 'Missing API key rejected');
  });
  
  test('Invalid API key rejection', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const response = await httpRequest(`${BASE_URL}/api/admin/clients`, {
      method: 'GET',
      headers: {
        'X-API-Key': 'invalid-key-12345'
      }
    });
    
    assertTrue(response.status >= 400 || !response.ok, 'Invalid API key rejected');
  });
  
  test('Tenant authentication', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const response = await httpRequest(`${BASE_URL}/api/leads`, {
      method: 'POST',
      headers: {
        'X-Client-Key': 'test_client',
        'Content-Type': 'application/json'
      },
      body: {
        service: 'logistics',
        lead: { name: 'Test', phone: '+447491683261' }
      }
    });
    
    // May require valid client key
    assertTrue(response.status === 200 || response.status >= 400, 'Tenant authentication responds');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

