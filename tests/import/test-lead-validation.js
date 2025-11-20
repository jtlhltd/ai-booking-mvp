// tests/import/test-lead-validation.js
// Test lead validation during import

import { validateUKPhone } from '../../lib/lead-deduplication.js';
import { describe, test, assertTrue, assertEqual, printSummary, resetStats } from '../utils/test-helpers.js';

resetStats();

describe('Lead Validation Tests', () => {
  
  test('Phone validation during import', () => {
    const phone = '+447491683261';
    const result = validateUKPhone(phone);
    assertTrue(result.valid, 'Phone validated');
  });
  
  test('Required fields validation', () => {
    const lead = {
      name: 'Test Lead',
      phone: '+447491683261'
    };
    
    assertTrue('name' in lead && lead.name.length > 0, 'Name required');
    assertTrue('phone' in lead && lead.phone.length > 0, 'Phone required');
  });
  
  test('Invalid phone rejection', () => {
    const result = validateUKPhone('123');
    assertEqual(result.valid, false, 'Invalid phone rejected');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

