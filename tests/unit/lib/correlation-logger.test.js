// tests/unit/lib/correlation-logger.test.js
// Unit tests for correlation logger

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { logWithCorrelation, createRequestLogger } from '../../../lib/correlation-logger.js';

describe('Correlation Logger', () => {
  let originalConsole;
  
  beforeEach(() => {
    originalConsole = { ...console };
    // Mock console methods
    console.log = jest.fn();
    console.error = jest.fn();
    console.warn = jest.fn();
  });
  
  afterEach(() => {
    Object.assign(console, originalConsole);
  });
  
  test('logWithCorrelation should include correlation ID', () => {
    const req = {
      correlationId: 'test-123',
      logContext: {
        correlationId: 'test-123',
        method: 'GET',
        path: '/test'
      }
    };
    
    logWithCorrelation(req, 'info', 'Test message', { extra: 'data' });
    
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('[test-123]'),
      expect.objectContaining({
        correlationId: 'test-123',
        level: 'info'
      })
    );
  });
  
  test('createRequestLogger should return logger functions', () => {
    const req = { correlationId: 'test-456' };
    const logger = createRequestLogger(req);
    
    expect(logger.error).toBeDefined();
    expect(logger.warn).toBeDefined();
    expect(logger.info).toBeDefined();
    expect(logger.debug).toBeDefined();
  });
});

