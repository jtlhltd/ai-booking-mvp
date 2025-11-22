// tests/unit/middleware/api-versioning.test.js
// Unit tests for API versioning middleware

import { describe, test, expect, jest } from '@jest/globals';
import { apiVersioning, versionedRoute } from '../../../middleware/api-versioning.js';

describe('API Versioning Middleware', () => {
  test('should extract version from path', () => {
    const middleware = apiVersioning();
    const req = {
      path: '/api/v1/health',
      get: () => null,
      apiVersion: undefined
    };
    const res = {
      set: jest.fn()
    };
    const next = jest.fn();
    
    middleware(req, res, next);
    
    expect(req.apiVersion).toBe(1);
    expect(res.set).toHaveBeenCalledWith('X-API-Version', '1');
    expect(next).toHaveBeenCalled();
  });
  
  test('should extract version from header', () => {
    const middleware = apiVersioning();
    const req = {
      path: '/api/health',
      get: (header) => header === 'X-API-Version' ? '2' : null,
      apiVersion: undefined
    };
    const res = {
      set: jest.fn()
    };
    const next = jest.fn();
    
    middleware(req, res, next);
    
    expect(req.apiVersion).toBe(2);
    expect(res.set).toHaveBeenCalledWith('X-API-Version', '2');
    expect(next).toHaveBeenCalled();
  });
  
  test('should default to version 1 if no version specified', () => {
    const middleware = apiVersioning();
    const req = {
      path: '/api/health',
      get: () => null,
      apiVersion: undefined
    };
    const res = {
      set: jest.fn()
    };
    const next = jest.fn();
    
    middleware(req, res, next);
    
    expect(req.apiVersion).toBe(1);
    expect(res.set).toHaveBeenCalledWith('X-API-Version', '1');
    expect(next).toHaveBeenCalled();
  });
  
  test('versionedRoute should reject version below minimum', () => {
    const handler = jest.fn();
    const versionedHandler = versionedRoute(handler, { minVersion: 2 });
    
    const req = { apiVersion: 1 };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    const next = jest.fn();
    
    versionedHandler(req, res, next);
    
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      error: 'Unsupported API version',
      message: 'This endpoint requires API version 2 or higher',
      requestedVersion: 1,
      minimumVersion: 2
    });
    expect(handler).not.toHaveBeenCalled();
  });
  
  test('versionedRoute should call handler for valid version', () => {
    const handler = jest.fn((req, res, next) => next());
    const versionedHandler = versionedRoute(handler, { minVersion: 1 });
    
    const req = { apiVersion: 1 };
    const res = {
      set: jest.fn()
    };
    const next = jest.fn();
    
    versionedHandler(req, res, next);
    
    expect(handler).toHaveBeenCalled();
  });
});

