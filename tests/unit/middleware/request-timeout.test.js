// tests/unit/middleware/request-timeout.test.js
// Unit tests for request timeout middleware

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { requestTimeout, smartRequestTimeout, getTimeoutForPath, TIMEOUTS } from '../../../../middleware/request-timeout.js';

describe('Request Timeout Middleware', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  
  afterEach(() => {
    jest.useRealTimers();
  });
  
  test('should set timeout for requests', () => {
    const middleware = requestTimeout(1000);
    const req = { method: 'GET', path: '/test', ip: '127.0.0.1' };
    const res = {
      headersSent: false,
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      end: jest.fn(),
      on: jest.fn()
    };
    const next = jest.fn();
    
    middleware(req, res, next);
    
    expect(next).toHaveBeenCalled();
    
    // Fast-forward time
    jest.advanceTimersByTime(1001);
    
    expect(res.status).toHaveBeenCalledWith(504);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      error: 'Request timeout',
      message: 'Request exceeded maximum duration of 1000ms',
      correlationId: expect.any(String)
    });
  });
  
  test('should clear timeout when response finishes', () => {
    const middleware = requestTimeout(1000);
    const req = { method: 'GET', path: '/test', ip: '127.0.0.1' };
    const originalEnd = jest.fn();
    const res = {
      headersSent: false,
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      end: originalEnd,
      on: jest.fn()
    };
    const next = jest.fn();
    
    middleware(req, res, next);
    
    // Simulate response finishing
    res.end();
    
    // Fast-forward time
    jest.advanceTimersByTime(1001);
    
    // Timeout should not fire
    expect(res.status).not.toHaveBeenCalled();
  });
  
  test('getTimeoutForPath should return correct timeouts', () => {
    expect(getTimeoutForPath('/api/health')).toBe(TIMEOUTS.health);
    expect(getTimeoutForPath('/api/stats')).toBe(TIMEOUTS.stats);
    expect(getTimeoutForPath('/webhooks/vapi')).toBe(TIMEOUTS.webhooks);
    expect(getTimeoutForPath('/api/bulk-import')).toBe(TIMEOUTS.bulkImport);
    expect(getTimeoutForPath('/api/analytics')).toBe(TIMEOUTS.analytics);
    expect(getTimeoutForPath('/api/test')).toBe(TIMEOUTS.default);
  });
  
  test('smartRequestTimeout should use path-based timeout', () => {
    const middleware = smartRequestTimeout();
    const req = { method: 'GET', path: '/api/health', ip: '127.0.0.1' };
    const res = {
      headersSent: false,
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      end: jest.fn(),
      on: jest.fn()
    };
    const next = jest.fn();
    
    middleware(req, res, next);
    
    expect(next).toHaveBeenCalled();
    
    // Health endpoint should timeout at 5 seconds
    jest.advanceTimersByTime(5001);
    
    expect(res.status).toHaveBeenCalledWith(504);
  });
});

