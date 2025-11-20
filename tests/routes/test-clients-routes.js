// tests/routes/test-clients-routes.js
// Test clients route endpoints

import { describe, test, assertTrue, skipIf, printSummary, resetStats, httpRequest, checkServerAvailable } from '../utils/test-helpers.js';

resetStats();

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:10000';
const API_KEY = process.env.TEST_API_KEY || process.env.API_KEY;

describe('Clients Routes Tests', () => {
  
  test('Server availability check', async () => {
    const available = await checkServerAvailable(BASE_URL);
    skipIf(!available, 'Server not available');
    assertTrue(available, 'Server is available');
  });
  
  test('List clients', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const response = await httpRequest(`${BASE_URL}/api/clients`, {
      method: 'GET',
      headers: {
        'X-API-Key': API_KEY
      }
    });
    
    assertTrue(response.ok || response.status === 200, 'Clients list retrieved');
  });
  
  test('Get client by key', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const response = await httpRequest(`${BASE_URL}/api/clients/test_client`, {
      method: 'GET',
      headers: {
        'X-API-Key': API_KEY
      }
    });
    
    assertTrue(response.status === 200 || response.status === 404, 'Get client responds');
  });
  
  test('Error handling in routes', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const response = await httpRequest(`${BASE_URL}/api/clients`, {
      method: 'GET'
      // Missing API key
    });
    
    assertTrue(response.status >= 400 || !response.ok, 'Error returned for missing auth');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

