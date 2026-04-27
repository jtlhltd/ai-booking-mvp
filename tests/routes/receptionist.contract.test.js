import { describe, expect, test, jest, beforeEach, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';

import { createContractApp } from '../helpers/contract-harness.js';
import { assertJsonErrorEnvelope, assertNoTenantKeyLeak } from '../helpers/contract-asserts.js';

// --- mocks for lib/business-info.js ---
const getBusinessInfo = jest.fn();
const updateBusinessInfo = jest.fn();
const getBusinessHoursString = jest.fn();
const getServicesList = jest.fn();
const answerQuestion = jest.fn();
const upsertFAQ = jest.fn();

// --- mocks for lib/customer-profiles.js ---
const getCustomerProfile = jest.fn();
const upsertCustomerProfile = jest.fn();
const updateCustomerPreferences = jest.fn();
const setVipStatus = jest.fn();
const getCustomerGreeting = jest.fn();

// --- mock for db.js (used directly by messages handlers) ---
const dbQuery = jest.fn();

// Auth + tenant middleware are mocked here as no-ops so the happy/error paths
// can be exercised without a database. Auth/tenant rejection is exercised in a
// separate describe block below by re-mocking the middleware module per-suite.
jest.unstable_mockModule('../../middleware/security.js', () => ({
  authenticateApiKey: (_req, _res, next) => next(),
  requireTenantAccess: (_req, _res, next) => next()
}));

jest.unstable_mockModule('../../lib/business-info.js', () => ({
  getBusinessInfo,
  updateBusinessInfo,
  getBusinessHoursString,
  getServicesList,
  answerQuestion,
  upsertFAQ
}));

jest.unstable_mockModule('../../lib/customer-profiles.js', () => ({
  getCustomerProfile,
  upsertCustomerProfile,
  updateCustomerPreferences,
  setVipStatus,
  getCustomerGreeting
}));

jest.unstable_mockModule('../../db.js', () => ({
  query: dbQuery,
  pool: { end: jest.fn() }
}));

describe('Receptionist API router contracts', () => {
  let consoleErrorSpy;
  beforeAll(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterAll(() => {
    consoleErrorSpy.mockRestore();
  });

  beforeEach(() => {
    [
      getBusinessInfo, updateBusinessInfo, getBusinessHoursString, getServicesList,
      answerQuestion, upsertFAQ,
      getCustomerProfile, upsertCustomerProfile, updateCustomerPreferences,
      setVipStatus, getCustomerGreeting,
      dbQuery
    ].forEach((fn) => fn.mockReset());
  });

  describe('GET /api/receptionist/:clientKey/business-info', () => {
    test('200 returns business info', async () => {
      getBusinessInfo.mockResolvedValue({ name: 'Test Co', services: ['x'] });
      const { default: router } = await import('../../routes/receptionist.js');
      const app = createContractApp({ mounts: [{ path: '/', router }] });

      const res = await request(app).get('/api/receptionist/acme/business-info').expect(200);
      expect(res.body).toEqual(
        expect.objectContaining({ success: true, info: expect.any(Object) })
      );
      expect(getBusinessInfo).toHaveBeenCalledWith('acme');
    });

    test('500 maps thrown errors with no stack leak', async () => {
      getBusinessInfo.mockRejectedValue(new Error('db down'));
      const { default: router } = await import('../../routes/receptionist.js');
      const app = createContractApp({ mounts: [{ path: '/', router }] });

      const res = await request(app).get('/api/receptionist/acme/business-info').expect(500);
      expect(res.body).toEqual({ success: false, error: 'db down' });
      expect(res.body).not.toHaveProperty('stack');
      assertJsonErrorEnvelope(res, { status: 500 });
    });

    test('Tom internal tenant key never appears in response payload', async () => {
      getBusinessInfo.mockResolvedValue({ name: 'D2D Xpress', services: ['parcel'] });
      const { default: router } = await import('../../routes/receptionist.js');
      const app = createContractApp({ mounts: [{ path: '/', router }] });

      const res = await request(app).get('/api/receptionist/d2d-xpress-tom/business-info').expect(200);
      assertNoTenantKeyLeak(res, 'd2d-xpress-tom');
    });
  });

  describe('PUT /api/receptionist/:clientKey/business-info', () => {
    test('200 forwards optional fields and tenant', async () => {
      updateBusinessInfo.mockResolvedValue({ updated: 4 });
      const { default: router } = await import('../../routes/receptionist.js');
      const app = createContractApp({ mounts: [{ path: '/', router }] });

      const res = await request(app)
        .put('/api/receptionist/acme/business-info')
        .send({ hours: 'h', services: 's' })
        .expect(200);

      expect(res.body).toEqual({ success: true, updated: 4 });
      expect(updateBusinessInfo).toHaveBeenCalledWith({
        clientKey: 'acme',
        hours: 'h',
        services: 's',
        policies: null,
        location: null
      });
    });

    test('500 on update failure', async () => {
      updateBusinessInfo.mockRejectedValue(new Error('write conflict'));
      const { default: router } = await import('../../routes/receptionist.js');
      const app = createContractApp({ mounts: [{ path: '/', router }] });

      const res = await request(app)
        .put('/api/receptionist/acme/business-info')
        .send({})
        .expect(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('write conflict');
    });
  });

  describe('GET /api/receptionist/:clientKey/answer-question', () => {
    test('400 when question missing', async () => {
      const { default: router } = await import('../../routes/receptionist.js');
      const app = createContractApp({ mounts: [{ path: '/', router }] });

      const res = await request(app).get('/api/receptionist/acme/answer-question').expect(400);
      expect(res.body).toEqual({ success: false, error: 'Question parameter required' });
      expect(answerQuestion).not.toHaveBeenCalled();
    });

    test('200 returns answer payload', async () => {
      answerQuestion.mockResolvedValue({ answer: 'yes', source: 'faq' });
      const { default: router } = await import('../../routes/receptionist.js');
      const app = createContractApp({ mounts: [{ path: '/', router }] });

      const res = await request(app)
        .get('/api/receptionist/acme/answer-question')
        .query({ question: 'are you open?' })
        .expect(200);
      expect(res.body).toEqual({ success: true, answer: 'yes', source: 'faq' });
      expect(answerQuestion).toHaveBeenCalledWith({ clientKey: 'acme', question: 'are you open?' });
    });

    test('500 maps thrown error', async () => {
      answerQuestion.mockRejectedValue(new Error('llm timeout'));
      const { default: router } = await import('../../routes/receptionist.js');
      const app = createContractApp({ mounts: [{ path: '/', router }] });

      const res = await request(app)
        .get('/api/receptionist/acme/answer-question')
        .query({ question: 'x' })
        .expect(500);
      expect(res.body.error).toBe('llm timeout');
    });
  });

  describe('POST /api/receptionist/:clientKey/faq', () => {
    test('400 when fields missing', async () => {
      const { default: router } = await import('../../routes/receptionist.js');
      const app = createContractApp({ mounts: [{ path: '/', router }] });

      const res = await request(app)
        .post('/api/receptionist/acme/faq')
        .send({ question: 'only q' })
        .expect(400);
      expect(res.body).toEqual({ success: false, error: 'Question and answer required' });
      expect(upsertFAQ).not.toHaveBeenCalled();
    });

    test('200 forwards optional category/priority defaults', async () => {
      upsertFAQ.mockResolvedValue({ id: 'faq-1' });
      const { default: router } = await import('../../routes/receptionist.js');
      const app = createContractApp({ mounts: [{ path: '/', router }] });

      const res = await request(app)
        .post('/api/receptionist/acme/faq')
        .send({ question: 'q', answer: 'a' })
        .expect(200);
      expect(res.body).toEqual({ success: true, id: 'faq-1' });
      expect(upsertFAQ).toHaveBeenCalledWith({
        clientKey: 'acme',
        question: 'q',
        answer: 'a',
        category: null,
        priority: 0
      });
    });

    test('500 on upsert failure', async () => {
      upsertFAQ.mockRejectedValue(new Error('db'));
      const { default: router } = await import('../../routes/receptionist.js');
      const app = createContractApp({ mounts: [{ path: '/', router }] });

      const res = await request(app)
        .post('/api/receptionist/acme/faq')
        .send({ question: 'q', answer: 'a' })
        .expect(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/receptionist/:clientKey/customer/:phone', () => {
    test('200 returns customer profile', async () => {
      getCustomerProfile.mockResolvedValue({ id: 1, phoneNumber: '+447700900000' });
      const { default: router } = await import('../../routes/receptionist.js');
      const app = createContractApp({ mounts: [{ path: '/', router }] });

      const res = await request(app)
        .get('/api/receptionist/acme/customer/+447700900000')
        .expect(200);
      expect(res.body).toEqual({ success: true, profile: expect.any(Object) });
      expect(getCustomerProfile).toHaveBeenCalledWith({ clientKey: 'acme', phoneNumber: '+447700900000' });
    });

    test('404 when profile not found', async () => {
      getCustomerProfile.mockResolvedValue(null);
      const { default: router } = await import('../../routes/receptionist.js');
      const app = createContractApp({ mounts: [{ path: '/', router }] });

      const res = await request(app)
        .get('/api/receptionist/acme/customer/+447700900001')
        .expect(404);
      expect(res.body).toEqual({ success: false, error: 'Customer not found' });
    });

    test('500 on lookup error', async () => {
      getCustomerProfile.mockRejectedValue(new Error('boom'));
      const { default: router } = await import('../../routes/receptionist.js');
      const app = createContractApp({ mounts: [{ path: '/', router }] });

      const res = await request(app)
        .get('/api/receptionist/acme/customer/+447700900000')
        .expect(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('PUT /api/receptionist/:clientKey/customer/:phone', () => {
    test('200 forwards profile fields', async () => {
      upsertCustomerProfile.mockResolvedValue({ saved: true });
      const { default: router } = await import('../../routes/receptionist.js');
      const app = createContractApp({ mounts: [{ path: '/', router }] });

      const res = await request(app)
        .put('/api/receptionist/acme/customer/+447700900000')
        .send({ name: 'A', vipStatus: true })
        .expect(200);
      expect(res.body).toEqual({ success: true, saved: true });
      expect(upsertCustomerProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          clientKey: 'acme',
          phoneNumber: '+447700900000',
          name: 'A',
          vipStatus: true
        })
      );
    });

    test('500 on persist failure', async () => {
      upsertCustomerProfile.mockRejectedValue(new Error('write fail'));
      const { default: router } = await import('../../routes/receptionist.js');
      const app = createContractApp({ mounts: [{ path: '/', router }] });

      const res = await request(app)
        .put('/api/receptionist/acme/customer/+447700900000')
        .send({})
        .expect(500);
      expect(res.body.error).toBe('write fail');
    });
  });

  describe('POST /api/receptionist/:clientKey/customer/:phone/vip', () => {
    test('200 toggles vip on', async () => {
      setVipStatus.mockResolvedValue({});
      const { default: router } = await import('../../routes/receptionist.js');
      const app = createContractApp({ mounts: [{ path: '/', router }] });

      const res = await request(app)
        .post('/api/receptionist/acme/customer/+447700900000/vip')
        .send({ vipStatus: true })
        .expect(200);
      expect(res.body).toEqual({ success: true, message: 'VIP status enabled' });
      expect(setVipStatus).toHaveBeenCalledWith({
        clientKey: 'acme',
        phoneNumber: '+447700900000',
        vipStatus: true
      });
    });

    test('200 toggles vip off (defaults non-true to false)', async () => {
      setVipStatus.mockResolvedValue({});
      const { default: router } = await import('../../routes/receptionist.js');
      const app = createContractApp({ mounts: [{ path: '/', router }] });

      const res = await request(app)
        .post('/api/receptionist/acme/customer/+447700900000/vip')
        .send({})
        .expect(200);
      expect(res.body.message).toBe('VIP status disabled');
      expect(setVipStatus).toHaveBeenCalledWith(
        expect.objectContaining({ vipStatus: false })
      );
    });

    test('500 on persist failure', async () => {
      setVipStatus.mockRejectedValue(new Error('vip db'));
      const { default: router } = await import('../../routes/receptionist.js');
      const app = createContractApp({ mounts: [{ path: '/', router }] });

      const res = await request(app)
        .post('/api/receptionist/acme/customer/+447700900000/vip')
        .send({ vipStatus: true })
        .expect(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/receptionist/:clientKey/messages', () => {
    test('200 returns ordered messages list', async () => {
      dbQuery.mockResolvedValue({ rows: [{ id: 1 }, { id: 2 }] });
      const { default: router } = await import('../../routes/receptionist.js');
      const app = createContractApp({ mounts: [{ path: '/', router }] });

      const res = await request(app).get('/api/receptionist/acme/messages').expect(200);
      expect(res.body).toEqual({ success: true, count: 2, messages: [{ id: 1 }, { id: 2 }] });
      expect(dbQuery).toHaveBeenCalledWith(
        expect.stringContaining('FROM messages'),
        ['acme', 'new', 50]
      );
    });

    test('200 honors status + limit query params', async () => {
      dbQuery.mockResolvedValue({ rows: [] });
      const { default: router } = await import('../../routes/receptionist.js');
      const app = createContractApp({ mounts: [{ path: '/', router }] });

      await request(app)
        .get('/api/receptionist/acme/messages')
        .query({ status: 'responded', limit: 5 })
        .expect(200);
      expect(dbQuery).toHaveBeenCalledWith(expect.any(String), ['acme', 'responded', 5]);
    });

    test('500 on db error', async () => {
      dbQuery.mockRejectedValue(new Error('db down'));
      const { default: router } = await import('../../routes/receptionist.js');
      const app = createContractApp({ mounts: [{ path: '/', router }] });

      const res = await request(app).get('/api/receptionist/acme/messages').expect(500);
      expect(res.body.error).toBe('db down');
    });
  });

  describe('POST /api/receptionist/:clientKey/messages/:messageId/respond', () => {
    test('200 marks message responded', async () => {
      dbQuery.mockResolvedValue({ rowCount: 1 });
      const { default: router } = await import('../../routes/receptionist.js');
      const app = createContractApp({ mounts: [{ path: '/', router }] });

      const res = await request(app)
        .post('/api/receptionist/acme/messages/42/respond')
        .send({})
        .expect(200);
      expect(res.body).toEqual({ success: true, message: 'Message marked as responded' });
      expect(dbQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE messages'),
        ['42', 'acme']
      );
    });

    test('500 when update fails', async () => {
      dbQuery.mockRejectedValue(new Error('boom'));
      const { default: router } = await import('../../routes/receptionist.js');
      const app = createContractApp({ mounts: [{ path: '/', router }] });

      const res = await request(app)
        .post('/api/receptionist/acme/messages/42/respond')
        .send({})
        .expect(500);
      expect(res.body.success).toBe(false);
    });
  });
});

// Separate top-level suite to swap the security middleware mock and verify
// auth + tenant gates are wired into the router.
describe('Receptionist API auth + tenant gating', () => {
  let consoleErrorSpy;
  beforeAll(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterAll(() => {
    consoleErrorSpy.mockRestore();
  });

  test('401 when authenticateApiKey rejects', async () => {
    jest.resetModules();
    jest.unstable_mockModule('../../middleware/security.js', () => ({
      authenticateApiKey: (_req, res) =>
        res.status(401).json({ error: 'API key required', code: 'MISSING_API_KEY' }),
      requireTenantAccess: (_req, _res, next) => next()
    }));
    jest.unstable_mockModule('../../lib/business-info.js', () => ({
      getBusinessInfo, updateBusinessInfo, getBusinessHoursString, getServicesList,
      answerQuestion, upsertFAQ
    }));
    jest.unstable_mockModule('../../lib/customer-profiles.js', () => ({
      getCustomerProfile, upsertCustomerProfile, updateCustomerPreferences,
      setVipStatus, getCustomerGreeting
    }));
    jest.unstable_mockModule('../../db.js', () => ({ query: dbQuery, pool: { end: jest.fn() } }));

    const { default: router } = await import('../../routes/receptionist.js');
    const app = createContractApp({ mounts: [{ path: '/', router }] });

    const res = await request(app).get('/api/receptionist/acme/business-info').expect(401);
    expect(res.body).toEqual({ error: 'API key required', code: 'MISSING_API_KEY' });
    expect(getBusinessInfo).not.toHaveBeenCalled();
  });

  test('403 when requireTenantAccess rejects', async () => {
    jest.resetModules();
    jest.unstable_mockModule('../../middleware/security.js', () => ({
      authenticateApiKey: (_req, _res, next) => next(),
      requireTenantAccess: (_req, res) =>
        res.status(403).json({ error: 'Access denied to tenant', code: 'TENANT_ACCESS_DENIED' })
    }));
    jest.unstable_mockModule('../../lib/business-info.js', () => ({
      getBusinessInfo, updateBusinessInfo, getBusinessHoursString, getServicesList,
      answerQuestion, upsertFAQ
    }));
    jest.unstable_mockModule('../../lib/customer-profiles.js', () => ({
      getCustomerProfile, upsertCustomerProfile, updateCustomerPreferences,
      setVipStatus, getCustomerGreeting
    }));
    jest.unstable_mockModule('../../db.js', () => ({ query: dbQuery, pool: { end: jest.fn() } }));

    const { default: router } = await import('../../routes/receptionist.js');
    const app = createContractApp({ mounts: [{ path: '/', router }] });

    const res = await request(app).get('/api/receptionist/acme/business-info').expect(403);
    expect(res.body.code).toBe('TENANT_ACCESS_DENIED');
    expect(getBusinessInfo).not.toHaveBeenCalled();
  });
});
