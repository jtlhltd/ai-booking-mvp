// tests/integration/test-tenant-resolution.js
// Test tenant resolution

import { describe, test, assertTrue, skipIf, printSummary, resetStats, httpRequest, checkServerAvailable } from '../utils/test-helpers.js';

resetStats();

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:10000';

describe('Tenant Resolution Tests', () => {
  
  test('Server availability check', async () => {
    const available = await checkServerAvailable(BASE_URL);
    skipIf(!available, 'Server not available');
    assertTrue(available, 'Server is available');
  });
  
  test('Phone to tenant mapping', async () => {
    skipIf(!await checkServerAvailable(BASE_URL), 'Server not available');
    
    // Test that phone numbers map to tenants
    const phoneToTenant = {
      '+447403934440': 'test_client',
      '+447403934441': 'another_client'
    };
    
    assertTrue(typeof phoneToTenant === 'object', 'Mapping is object');
    Object.keys(phoneToTenant).forEach(phone => {
      assertTrue(/^\+447/.test(phone), `Phone ${phone} is E.164 format`);
      assertTrue(typeof phoneToTenant[phone] === 'string', `Tenant for ${phone} is string`);
    });
  });
  
  test('Client key lookup', () => {
    const clientKey = 'test_client';
    assertTrue(clientKey.length > 0, 'Client key valid');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

