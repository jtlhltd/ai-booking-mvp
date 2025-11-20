// tests/integration/test-vapi-function-handlers.js
// Test VAPI function handlers

import { handleVapiFunctionCall } from '../../lib/vapi-function-handlers.js';
import { describe, test, assertTrue, assertEqual, printSummary, resetStats } from '../utils/test-helpers.js';

resetStats();

describe('VAPI Function Handlers Tests', () => {
  
  const mockMetadata = {
    clientKey: 'test_client',
    tenantKey: 'test_client'
  };
  
  test('lookup_customer function', async () => {
    const result = await handleVapiFunctionCall({
      functionName: 'lookup_customer',
      arguments: { phone: '+447491683261' },
      metadata: mockMetadata
    });
    
    assertTrue(typeof result === 'object', 'lookup_customer returns object');
    assertTrue('success' in result, 'Result has success field');
  });
  
  test('lookup_appointment function', async () => {
    const result = await handleVapiFunctionCall({
      functionName: 'lookup_appointment',
      arguments: { phone: '+447491683261' },
      metadata: mockMetadata
    });
    
    assertTrue(typeof result === 'object', 'lookup_appointment returns object');
  });
  
  test('get_upcoming_appointments function', async () => {
    const result = await handleVapiFunctionCall({
      functionName: 'get_upcoming_appointments',
      arguments: { phone: '+447491683261' },
      metadata: mockMetadata
    });
    
    assertTrue(typeof result === 'object', 'get_upcoming_appointments returns object');
  });
  
  test('get_business_info function', async () => {
    const result = await handleVapiFunctionCall({
      functionName: 'get_business_info',
      arguments: {},
      metadata: mockMetadata
    });
    
    assertTrue(typeof result === 'object', 'get_business_info returns object');
  });
  
  test('get_business_hours function', async () => {
    const result = await handleVapiFunctionCall({
      functionName: 'get_business_hours',
      arguments: {},
      metadata: mockMetadata
    });
    
    assertTrue(typeof result === 'object', 'get_business_hours returns object');
  });
  
  test('get_services function', async () => {
    const result = await handleVapiFunctionCall({
      functionName: 'get_services',
      arguments: {},
      metadata: mockMetadata
    });
    
    assertTrue(typeof result === 'object', 'get_services returns object');
  });
  
  test('answer_question function', async () => {
    const result = await handleVapiFunctionCall({
      functionName: 'answer_question',
      arguments: { question: 'What are your hours?' },
      metadata: mockMetadata
    });
    
    assertTrue(typeof result === 'object', 'answer_question returns object');
  });
  
  test('take_message function', async () => {
    const result = await handleVapiFunctionCall({
      functionName: 'take_message',
      arguments: { 
        callerName: 'John',
        message: 'Please call back',
        phone: '+447491683261'
      },
      metadata: mockMetadata
    });
    
    assertTrue(typeof result === 'object', 'take_message returns object');
  });
  
  test('Unknown function handling', async () => {
    const result = await handleVapiFunctionCall({
      functionName: 'unknown_function',
      arguments: {},
      metadata: mockMetadata
    });
    
    assertTrue(result.success === false, 'Unknown function returns error');
    assertTrue(result.error.length > 0, 'Error message provided');
  });
  
  test('Missing client key handling', async () => {
    const result = await handleVapiFunctionCall({
      functionName: 'get_business_info',
      arguments: {},
      metadata: {}
    });
    
    assertTrue(result.success === false, 'Missing client key returns error');
  });
});

const exitCode = printSummary();
process.exit(exitCode);

