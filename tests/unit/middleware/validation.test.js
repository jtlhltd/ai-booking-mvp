import { describe, expect, test, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

import {
  validationSchemas,
  validateRequest,
  sanitizeInput,
  createEndpointRateLimit
} from '../../../middleware/validation.js';
import { ValidationError, RateLimitError } from '../../../lib/errors.js';

describe('middleware/validation', () => {
  describe('validateRequest', () => {
    test('passes valid body and assigns validated value to req.body', () => {
      const mw = validateRequest(validationSchemas.createClient);
      const req = {
        body: {
          businessName: 'Acme Ltd',
          industry: 'legal',
          ownerEmail: 'owner@example.com',
          ownerPhone: '+441234567890'
        }
      };
      const res = {};
      const next = jest.fn();
      mw(req, res, next);
      expect(next).toHaveBeenCalledWith();
      expect(req.body.businessName).toBe('Acme Ltd');
      expect(req.body.industry).toBe('legal');
    });

    test('calls next with ValidationError when body invalid', () => {
      const mw = validateRequest(validationSchemas.createClient);
      const req = { body: { businessName: 'x' } };
      const res = {};
      const next = jest.fn();
      mw(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
      const err = next.mock.calls[0][0];
      expect(err).toBeInstanceOf(ValidationError);
      expect(err.message).toMatch(/validation failed/i);
    });

    test('validates query when source is query', () => {
      const mw = validateRequest(validationSchemas.queryParams, 'query');
      const req = {
        query: { status: 'booked', limit: '10', offset: '0' }
      };
      const res = {};
      const next = jest.fn();
      mw(req, res, next);
      expect(next).toHaveBeenCalledWith();
      expect(req.query.status).toBe('booked');
      expect(req.query.limit).toBe(10);
    });

    test('validates params when source is params', () => {
      const mw = validateRequest(validationSchemas.queryParams, 'params');
      const req = { params: { limit: '5', offset: '0', sortBy: 'name' } };
      const res = {};
      const next = jest.fn();
      mw(req, res, next);
      expect(next).toHaveBeenCalledWith();
      expect(req.params.limit).toBe(5);
    });
  });

  describe('sanitizeInput', () => {
    test('strips script-like content from strings in body', () => {
      const req = {
        body: { msg: '<script>alert(1)</script>hello' },
        query: {},
        params: {}
      };
      const res = {};
      const next = jest.fn();
      sanitizeInput(req, res, next);
      expect(next).toHaveBeenCalledWith();
      expect(req.body.msg).toBe('hello');
    });

    test('recursively sanitizes nested objects', () => {
      const req = {
        body: { nested: { x: 'javascript:void(0)' } },
        query: {},
        params: {}
      };
      const res = {};
      const next = jest.fn();
      sanitizeInput(req, res, next);
      expect(req.body.nested.x).toBe('void(0)');
    });
  });

  describe('createEndpointRateLimit', () => {
    test('allows up to max requests then passes RateLimitError', () => {
      const limiter = createEndpointRateLimit({ windowMs: 60_000, max: 2, keyGenerator: () => 'same' });
      const req = { ip: '1.1.1.1', path: '/api/x' };
      const res = { set: jest.fn() };
      const next = jest.fn();

      limiter(req, res, next);
      expect(next).toHaveBeenLastCalledWith();
      limiter(req, res, next);
      expect(next).toHaveBeenLastCalledWith();
      next.mockClear();
      limiter(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(next.mock.calls[0][0]).toBeInstanceOf(RateLimitError);
    });
  });

  describe('validationSchemas', () => {
    test('importLeads schema accepts minimal valid lead', () => {
      const { error, value } = validationSchemas.importLeads.validate(
        {
          leads: [{ name: 'A', phone: '+441234567890' }]
        },
        { abortEarly: false, stripUnknown: true }
      );
      expect(error).toBeUndefined();
      expect(value.leads).toHaveLength(1);
    });

    test('smsWebhook schema requires Twilio fields', () => {
      const { error } = validationSchemas.smsWebhook.validate(
        { From: 'bad', To: '+441234567890', Body: 'hi', MessageSid: 'sid' },
        { abortEarly: false }
      );
      expect(error).toBeDefined();
    });
  });

  describe('validateRequest HTTP integration', () => {
    test('returns 400 when used with error handler that maps ValidationError', async () => {
      const app = express();
      app.use(express.json());
      app.post(
        '/x',
        validateRequest(validationSchemas.createClient),
        (req, res) => res.json({ ok: true })
      );
      app.use((err, req, res, next) => {
        if (err instanceof ValidationError) {
          return res.status(err.statusCode || 400).json({ error: err.message, code: err.code });
        }
        next(err);
      });

      const res = await request(app)
        .post('/x')
        .send({ businessName: 'ab' })
        .expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });
  });
});
