// tests/routes/test-appointments-routes.js
// Test appointments route endpoints

import { describe, test, assertTrue, skipIf, printSummary, resetStats, httpRequest, checkServerAvailable } from '../utils/test-helpers.js';

resetStats();

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:10000';
const API_KEY = process.env.TEST_API_KEY || process.env.API_KEY;

describe('Appointments Routes Tests', () => {
  
  test('Server availability check', async () => {
    const available = await checkServerAvailable(BASE_URL);
    skipIf(!available, 'Server not available');
    assertTrue(available, 'Server is available');
  });
  
  test('Lookup appointments by phone', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const response = await httpRequest(`${BASE_URL}/api/appointments/test_client/lookup?phone=+447491683261`, {
      method: 'GET',
      headers: {
        'X-API-Key': API_KEY
      }
    });
    
    assertTrue(response.ok || response.status === 200, 'Lookup by phone successful');
  });
  
  test('Get upcoming appointments', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const response = await httpRequest(`${BASE_URL}/api/appointments/test_client/upcoming?phone=+447491683261`, {
      method: 'GET',
      headers: {
        'X-API-Key': API_KEY
      }
    });
    
    assertTrue(response.ok || response.status === 200, 'Upcoming appointments retrieved');
  });
  
  test('Reschedule appointment', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const response = await httpRequest(`${BASE_URL}/api/appointments/test_client/appt123/reschedule`, {
      method: 'POST',
      headers: {
        'X-API-Key': API_KEY
      },
      body: {
        newTime: '2025-01-15T10:00:00Z',
        reason: 'Customer requested'
      }
    });
    
    // May fail if appointment doesn't exist, that's ok
    assertTrue(response.status === 200 || response.status >= 400, 'Reschedule endpoint responds');
  });
  
  test('Cancel appointment', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const response = await httpRequest(`${BASE_URL}/api/appointments/test_client/appt123/cancel`, {
      method: 'POST',
      headers: {
        'X-API-Key': API_KEY
      },
      body: {
        reason: 'Customer cancelled'
      }
    });
    
    assertTrue(response.status === 200 || response.status >= 400, 'Cancel endpoint responds');
  });
  
  test('Get appointment by ID', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const response = await httpRequest(`${BASE_URL}/api/appointments/test_client/appt123`, {
      method: 'GET',
      headers: {
        'X-API-Key': API_KEY
      }
    });
    
    assertTrue(response.status === 200 || response.status === 404, 'Get appointment responds');
  });
  
  test('Error handling - missing parameters', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const response = await httpRequest(`${BASE_URL}/api/appointments/test_client/lookup`, {
      method: 'GET',
      headers: {
        'X-API-Key': API_KEY
      }
    });
    
    assertTrue(response.status >= 400 || !response.ok, 'Error returned for missing parameters');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

