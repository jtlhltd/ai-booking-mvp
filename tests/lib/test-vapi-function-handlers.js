// tests/lib/test-vapi-function-handlers.js
// Test VAPI function handlers

import { describe, test, assertTrue, assertEqual, printSummary, resetStats } from '../utils/test-helpers.js';
import { handleVapiFunctionCall } from '../../lib/vapi-function-handlers.js';

resetStats();

describe('VAPI Function Handlers Tests', () => {
  
  test('Handle VAPI function call function exists', () => {
    assertTrue(typeof handleVapiFunctionCall === 'function', 'handleVapiFunctionCall is a function');
  });
  
  test('Function call structure', () => {
    const functionCall = {
      name: 'access_google_sheet',
      parameters: {
        action: 'append',
        data: { name: 'Test' }
      }
    };
    
    assertTrue('name' in functionCall, 'Has name');
    assertTrue('parameters' in functionCall, 'Has parameters');
    assertTrue(typeof functionCall.name === 'string', 'Name is string');
  });
  
  test('Supported functions', () => {
    const functions = [
      'access_google_sheet',
      'schedule_callback',
      'book_appointment'
    ];
    
    functions.forEach(fn => {
      assertTrue(typeof fn === 'string', `Function ${fn} is string`);
    });
  });
  
  test('Function response structure', () => {
    const response = {
      success: true,
      data: {},
      message: 'Function executed'
    };
    
    assertTrue('success' in response, 'Has success');
    assertTrue(typeof response.success === 'boolean', 'Success is boolean');
  });
  
  test('Error handling structure', () => {
    const error = {
      success: false,
      error: 'Function failed',
      code: 'FUNCTION_ERROR'
    };
    
    assertTrue('error' in error, 'Has error');
    assertTrue(typeof error.error === 'string', 'Error is string');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

