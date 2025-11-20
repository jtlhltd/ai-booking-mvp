// tests/admin/test-admin-clients-crud.js
// Test admin clients CRUD operations

import { describe, test, assertTrue, skipIf, printSummary, resetStats, httpRequest, checkServerAvailable } from '../utils/test-helpers.js';

resetStats();

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:10000';
const API_KEY = process.env.TEST_API_KEY || process.env.API_KEY;

describe('Admin Clients CRUD Tests', () => {
  
  test('Server availability check', async () => {
    const available = await checkServerAvailable(BASE_URL);
    skipIf(!available, 'Server not available');
    assertTrue(available, 'Server is available');
  });
  
  test('List clients', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const response = await httpRequest(`${BASE_URL}/api/admin/clients`, {
      method: 'GET',
      headers: {
        'X-API-Key': API_KEY
      }
    });
    
    assertTrue(response.ok || response.status === 200, 'Clients list retrieved');
  });
  
  test('Create client', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const response = await httpRequest(`${BASE_URL}/api/admin/client`, {
      method: 'POST',
      headers: {
        'X-API-Key': API_KEY
      },
      body: {
        businessName: `Test Business ${Date.now()}`,
        industry: 'healthcare'
      }
    });
    
    assertTrue(response.ok || response.status === 200 || response.status === 201, 'Client created');
  });
  
  test('Update client', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const response = await httpRequest(`${BASE_URL}/api/admin/client/test_client`, {
      method: 'PUT',
      headers: {
        'X-API-Key': API_KEY
      },
      body: {
        displayName: 'Updated Name'
      }
    });
    
    assertTrue(response.status === 200 || response.status === 404, 'Update client responds');
  });
  
  test('Delete client', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const response = await httpRequest(`${BASE_URL}/api/admin/client/test_client`, {
      method: 'DELETE',
      headers: {
        'X-API-Key': API_KEY
      }
    });
    
    assertTrue(response.status === 200 || response.status === 404, 'Delete client responds');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

