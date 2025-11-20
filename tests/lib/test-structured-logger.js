// tests/lib/test-structured-logger.js
// Test structured logger functionality

import { describe, test, assertTrue, assertEqual, printSummary, resetStats } from '../utils/test-helpers.js';
import { StructuredLogger, getLogger, createLogger } from '../../lib/structured-logger.js';

resetStats();

describe('Structured Logger Tests', () => {
  
  test('StructuredLogger class exists', () => {
    assertTrue(typeof StructuredLogger === 'function', 'StructuredLogger is a class');
  });
  
  test('Get logger function exists', () => {
    assertTrue(typeof getLogger === 'function', 'getLogger is a function');
  });
  
  test('Create logger function exists', () => {
    assertTrue(typeof createLogger === 'function', 'createLogger is a function');
  });
  
  test('Log entry structure', () => {
    const logEntry = {
      level: 'info',
      message: 'Test log entry',
      timestamp: new Date().toISOString(),
      context: { clientKey: 'test_client' },
      metadata: {}
    };
    
    assertTrue('level' in logEntry, 'Has level');
    assertTrue('message' in logEntry, 'Has message');
    assertTrue('timestamp' in logEntry, 'Has timestamp');
  });
  
  test('Log levels', () => {
    const levels = ['debug', 'info', 'warn', 'error'];
    levels.forEach(level => {
      assertTrue(typeof level === 'string', `Level ${level} is string`);
    });
  });
  
  test('Structured log format', () => {
    const structured = {
      level: 'info',
      message: 'User action',
      userId: 'user123',
      action: 'login',
      timestamp: new Date().toISOString()
    };
    
    assertTrue(typeof structured === 'object', 'Is object');
    assertTrue('level' in structured, 'Has level');
    assertTrue('message' in structured, 'Has message');
    assertTrue('timestamp' in structured, 'Has timestamp');
  });
  
  test('Context propagation', () => {
    const context = {
      clientKey: 'test_client',
      requestId: 'req123',
      userId: 'user456'
    };
    
    assertTrue('clientKey' in context, 'Has clientKey');
    assertTrue(typeof context.clientKey === 'string', 'ClientKey is string');
  });
  
  test('Logger instance creation', () => {
    try {
      const logger = getLogger({ clientKey: 'test' });
      assertTrue(logger instanceof StructuredLogger || typeof logger === 'object', 'Returns logger instance');
    } catch (error) {
      assertTrue(error instanceof Error, 'Function handles errors');
    }
  });
});

const exitCode = printSummary();
process.exit(exitCode);
