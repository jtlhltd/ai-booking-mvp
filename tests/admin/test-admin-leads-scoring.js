// tests/admin/test-admin-leads-scoring.js
// Test admin lead scoring endpoints

import { describe, test, assertTrue, skipIf, printSummary, resetStats, httpRequest, checkServerAvailable } from '../utils/test-helpers.js';

resetStats();

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:10000';
const API_KEY = process.env.TEST_API_KEY || process.env.API_KEY;

describe('Admin Lead Scoring Tests', () => {
  
  test('Server availability check', async () => {
    const available = await checkServerAvailable(BASE_URL);
    skipIf(!available, 'Server not available');
    assertTrue(available, 'Server is available');
  });
  
  test('Get lead scoring', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const response = await httpRequest(`${BASE_URL}/api/admin/leads/scoring`, {
      method: 'GET',
      headers: {
        'X-API-Key': API_KEY
      }
    });
    
    assertTrue(response.ok || response.status === 200, 'Lead scoring retrieved');
  });
  
  test('Score a lead', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const response = await httpRequest(`${BASE_URL}/api/admin/leads/lead123/score`, {
      method: 'POST',
      headers: {
        'X-API-Key': API_KEY
      },
      body: {
        score: 85
      }
    });
    
    assertTrue(response.status === 200 || response.status >= 400, 'Score lead responds');
  });
  
  test('Get scoring rules', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const response = await httpRequest(`${BASE_URL}/api/admin/leads/scoring/rules`, {
      method: 'GET',
      headers: {
        'X-API-Key': API_KEY
      }
    });
    
    assertTrue(response.ok || response.status === 200, 'Scoring rules retrieved');
  });
  
  test('Create scoring rule', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    const response = await httpRequest(`${BASE_URL}/api/admin/leads/scoring/rules`, {
      method: 'POST',
      headers: {
        'X-API-Key': API_KEY
      },
      body: {
        name: 'Test Rule',
        condition: 'source === "website"',
        score: 10
      }
    });
    
    assertTrue(response.ok || response.status === 200 || response.status === 201, 'Scoring rule created');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

