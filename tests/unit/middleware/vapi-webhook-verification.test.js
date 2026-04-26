// tests/unit/middleware/vapi-webhook-verification.test.js
// Unit tests for VAPI webhook signature verification

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import crypto from 'crypto';
import { verifyVapiSignature } from '../../../middleware/vapi-webhook-verification.js';

describe('VAPI Webhook Signature Verification', () => {
  const originalSecret = process.env.VAPI_WEBHOOK_SECRET;
  const secret = 'test-secret-key-12345';
  const originalNodeEnv = process.env.NODE_ENV;
  const originalRequire = process.env.VAPI_WEBHOOK_REQUIRE_SIGNATURE;
  
  beforeEach(() => {
    process.env.VAPI_WEBHOOK_SECRET = secret;
    process.env.NODE_ENV = 'test';
    delete process.env.VAPI_WEBHOOK_REQUIRE_SIGNATURE;
  });
  
  afterEach(() => {
    if (originalNodeEnv) {
      process.env.NODE_ENV = originalNodeEnv;
    } else {
      delete process.env.NODE_ENV;
    }
    if (originalRequire) {
      process.env.VAPI_WEBHOOK_REQUIRE_SIGNATURE = originalRequire;
    } else {
      delete process.env.VAPI_WEBHOOK_REQUIRE_SIGNATURE;
    }
    if (originalSecret) {
      process.env.VAPI_WEBHOOK_SECRET = originalSecret;
    } else {
      delete process.env.VAPI_WEBHOOK_SECRET;
    }
  });
  
  test('should skip verification if no secret configured', () => {
    delete process.env.VAPI_WEBHOOK_SECRET;
    
    const req = {
      get: () => null,
      body: { test: 'data' },
      correlationId: 'test-123'
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    const next = jest.fn();
    
    verifyVapiSignature(req, res, next);
    
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('should reject if secret missing when signature required', () => {
    delete process.env.VAPI_WEBHOOK_SECRET;
    process.env.VAPI_WEBHOOK_REQUIRE_SIGNATURE = 'true';

    const req = {
      get: () => null,
      body: { test: 'data' },
      correlationId: 'test-123'
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    const next = jest.fn();

    verifyVapiSignature(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(next).not.toHaveBeenCalled();
  });
  
  test('should reject request with missing signature', () => {
    const req = {
      get: () => null,
      body: { test: 'data' },
      rawBody: Buffer.from(JSON.stringify({ test: 'data' })),
      correlationId: 'test-123'
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    const next = jest.fn();
    
    verifyVapiSignature(req, res, next);
    
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      error: 'Missing webhook signature',
      message: 'X-Vapi-Signature header is required'
    });
    expect(next).not.toHaveBeenCalled();
  });
  
  test('should reject request with invalid signature', () => {
    const body = { test: 'data' };
    const bodyString = JSON.stringify(body);
    // Invalid signature must be same length as valid signature (64 hex chars)
    const invalidSignature = 'a'.repeat(64);
    
    const req = {
      get: (header) => header === 'X-Vapi-Signature' ? invalidSignature : null,
      body,
      rawBody: Buffer.from(bodyString),
      correlationId: 'test-123'
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    const next = jest.fn();
    
    verifyVapiSignature(req, res, next);
    
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      error: 'Invalid webhook signature',
      message: 'Webhook signature verification failed'
    });
    expect(next).not.toHaveBeenCalled();
  });
  
  test('returns 500 in production when secret is set but raw body is missing', () => {
    process.env.NODE_ENV = 'production';
    const body = { test: 'data' };
    const bodyString = JSON.stringify(body);
    const validSignature = crypto.createHmac('sha256', secret).update(bodyString).digest('hex');
    const req = {
      get: (header) => (header === 'X-Vapi-Signature' ? validSignature : null),
      body,
      correlationId: 'test-123'
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    const next = jest.fn();
    verifyVapiSignature(req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(next).not.toHaveBeenCalled();
  });

  test('should accept request with valid signature', () => {
    const body = { test: 'data' };
    const bodyString = JSON.stringify(body);
    const validSignature = crypto
      .createHmac('sha256', secret)
      .update(bodyString)
      .digest('hex');
    
    const req = {
      get: (header) => header === 'X-Vapi-Signature' ? validSignature : null,
      body,
      rawBody: Buffer.from(bodyString),
      correlationId: 'test-123'
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    const next = jest.fn();
    
    verifyVapiSignature(req, res, next);
    
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});

