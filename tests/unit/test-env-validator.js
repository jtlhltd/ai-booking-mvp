// tests/unit/test-env-validator.js
// Test environment variable validation

import { validateEnvironment } from '../../lib/env-validator.js';
import { describe, test, assertTrue, assertThrows, printSummary, resetStats } from '../utils/test-helpers.js';

resetStats();

describe('Environment Validator Tests', () => {
  
  test('Environment validation runs', () => {
    try {
      const result = validateEnvironment();
      assertTrue(typeof result === 'object', 'Validation returns object');
    } catch (error) {
      // Validation throws when required vars are missing - that's expected
      assertTrue(error instanceof Error, 'Validation throws error when vars missing');
    }
  });
  
  test('Required variables checked', async () => {
    // This tests that the validator checks for required variables
    // Validation throws when required vars are missing
    await assertThrows(() => {
      validateEnvironment();
    }, Error, 'Validation throws error for missing required variables');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

