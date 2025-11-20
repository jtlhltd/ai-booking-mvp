// tests/routes/test-receptionist-routes.js
// Test receptionist route endpoints

import { describe, test, assertTrue, skipIf, printSummary, resetStats, httpRequest, checkServerAvailable } from '../utils/test-helpers.js';

resetStats();

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:10000';
const API_KEY = process.env.TEST_API_KEY || process.env.API_KEY;

describe('Receptionist Routes Tests', () => {
  
  test('Server availability check', async () => {
    const available = await checkServerAvailable(BASE_URL);
    skipIf(!available, 'Server not available');
    assertTrue(available, 'Server is available');
  });
  
  test('Get business info', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const response = await httpRequest(`${BASE_URL}/api/receptionist/test_client/business-info`, {
      method: 'GET',
      headers: {
        'X-API-Key': API_KEY
      }
    });
    
    assertTrue(response.ok || response.status === 200, 'Business info retrieved');
  });
  
  test('Update business info', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const response = await httpRequest(`${BASE_URL}/api/receptionist/test_client/business-info`, {
      method: 'PUT',
      headers: {
        'X-API-Key': API_KEY
      },
      body: {
        hours: { monday: '9am-5pm' },
        services: ['Consultation']
      }
    });
    
    assertTrue(response.ok || response.status === 200, 'Business info updated');
  });
  
  test('Get customer profile', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const response = await httpRequest(`${BASE_URL}/api/receptionist/test_client/customer-profile?phone=+447491683261`, {
      method: 'GET',
      headers: {
        'X-API-Key': API_KEY
      }
    });
    
    assertTrue(response.ok || response.status === 200, 'Customer profile retrieved');
  });
  
  test('Answer question', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const response = await httpRequest(`${BASE_URL}/api/receptionist/test_client/answer-question?question=What are your hours?`, {
      method: 'GET',
      headers: {
        'X-API-Key': API_KEY
      }
    });
    
    assertTrue(response.ok || response.status === 200, 'Question answered');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

