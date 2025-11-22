// tests/unit/middleware/vapi-webhook-verification.test.js
// Unit tests for VAPI webhook signature verification

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import crypto from 'crypto';
import { verifyVapiSignature } from '../../../../middleware/vapi-webhook-verification.js';

describe('VAPI Webhook Signature Verification', () => {
  const originalSecret = process.env.VAPI_WEBHOOK_SECRET;
  const secret = 'test-secret-key-12345';
  
  beforeEach(() => {
    process.env.VAPI_WEBHOOK_SECRET = secret;
  });
  
  afterEach(() => {
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
    const invalidSignature = 'invalid-signature';
    
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

