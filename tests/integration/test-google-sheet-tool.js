// tests/integration/test-google-sheet-tool.js
// Test Google Sheet tool endpoint

import { describe, test, assertEqual, assertTrue, skipIf, printSummary, resetStats, httpRequest, checkServerAvailable } from '../utils/test-helpers.js';

resetStats();

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:10000';
const API_KEY = process.env.TEST_API_KEY || process.env.API_KEY;

describe('Google Sheet Tool Integration Tests', () => {
  
  test('Server availability check', async () => {
    const available = await checkServerAvailable(BASE_URL);
    skipIf(!available, 'Server not available - skipping integration tests');
    assertTrue(available, 'Server is available');
  });
  
  test('Append action with full logistics data', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const response = await httpRequest(`${BASE_URL}/tools/access_google_sheet`, {
      method: 'POST',
      headers: {
        'X-API-Key': API_KEY
      },
      body: {
        action: 'append',
        data: {
          businessName: 'Test Business Ltd',
          decisionMaker: 'John Smith',
          phone: '+447491683261',
          email: 'test@example.com',
          international: 'Y',
          mainCouriers: ['DHL', 'FedEx'],
          frequency: '50 per week',
          mainCountries: ['USA', 'Germany'],
          exampleShipment: '5kg, 30x20x15cm',
          exampleShipmentCost: '£7',
          domesticFrequency: '20 per day',
          ukCourier: 'Royal Mail',
          standardRateUpToKg: '2kg',
          excludingFuelVat: 'Y',
          singleVsMulti: 'Single',
          receptionistName: 'Sarah',
          callbackNeeded: false,
          callId: `test_${Date.now()}`,
          recordingUrl: 'https://test.com/recording.mp3',
          transcriptSnippet: 'Test transcript'
        },
        tenantKey: 'logistics_client'
      }
    });
    
    assertTrue(response.ok || response.status === 200, 'Append action successful');
    if (response.data) {
      assertTrue(response.data.success !== false, 'Response indicates success');
    }
  });
  
  test('Append action with partial data', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const response = await httpRequest(`${BASE_URL}/tools/access_google_sheet`, {
      method: 'POST',
      headers: {
        'X-API-Key': API_KEY
      },
      body: {
        action: 'append',
        data: {
          businessName: 'Partial Business',
          phone: '+447491683261',
          email: 'partial@example.com'
        },
        tenantKey: 'logistics_client'
      }
    });
    
    assertTrue(response.ok || response.status === 200, 'Partial data append successful');
  });
  
  test('Read action', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const response = await httpRequest(`${BASE_URL}/tools/access_google_sheet`, {
      method: 'POST',
      headers: {
        'X-API-Key': API_KEY
      },
      body: {
        action: 'read',
        tenantKey: 'logistics_client'
      }
    });
    
    assertTrue(response.ok || response.status === 200, 'Read action successful');
  });
  
  test('Error handling - missing sheet ID', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const response = await httpRequest(`${BASE_URL}/tools/access_google_sheet`, {
      method: 'POST',
      headers: {
        'X-API-Key': API_KEY
      },
      body: {
        action: 'append',
        data: { businessName: 'Test' },
        tenantKey: 'invalid_tenant'
      }
    });
    
    // Should return error for missing sheet ID
    assertTrue(response.status >= 400 || !response.ok, 'Error returned for missing sheet ID');
  });
  
  test('Error handling - invalid action', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const response = await httpRequest(`${BASE_URL}/tools/access_google_sheet`, {
      method: 'POST',
      headers: {
        'X-API-Key': API_KEY
      },
      body: {
        action: 'invalid_action',
        tenantKey: 'logistics_client'
      }
    });
    
    assertTrue(response.status >= 400 || !response.ok, 'Error returned for invalid action');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

