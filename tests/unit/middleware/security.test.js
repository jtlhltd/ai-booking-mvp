import { describe, expect, test, jest, beforeAll, afterAll, beforeEach } from '@jest/globals';

const getApiKeyByHash = jest.fn();
const updateApiKeyLastUsed = jest.fn();
const logSecurityEvent = jest.fn(async () => {});
const checkRateLimit = jest.fn(async () => ({
  exceeded: false,
  remainingMinute: 99,
  remainingHour: 999,
  minuteCount: 1,
  hourCount: 1
}));
const recordRateLimitRequest = jest.fn(async () => {});
const cleanupOldRateLimitRecords = jest.fn(async () => {});

const twilioWebhookFactory = jest.fn();
const twilioValidator = jest.fn();
twilioWebhookFactory.mockImplementation(() => twilioValidator);

const formatErrorResponse = jest.fn((err, reqOrNull) => ({
  ok: false,
  message: err?.message || 'err',
  exposed: !!reqOrNull,
}));
const logError = jest.fn(() => ({ logged: true }));
class AppError extends Error {}

jest.unstable_mockModule('../../../db.js', () => ({
  getApiKeyByHash,
  updateApiKeyLastUsed,
  logSecurityEvent,
  checkRateLimit,
  recordRateLimitRequest,
  cleanupOldRateLimitRecords
}));

jest.unstable_mockModule('twilio', () => ({
  default: { webhook: twilioWebhookFactory }
}));

jest.unstable_mockModule('../../../lib/errors.js', () => ({
  formatErrorResponse,
  logError,
  AppError
}));

let generateApiKey;
let hashApiKey;
let authenticateApiKey;
let requireTenantAccess;
let requirePermission;
let rateLimitMiddleware;
let securityHeaders;
let twilioWebhookVerification;
let errorHandler;
let validateAndSanitizeInput;
let validateInput;

describe('middleware/security', () => {
  let setIntervalSpy;

  beforeAll(async () => {
    setIntervalSpy = jest.spyOn(global, 'setInterval').mockImplementation(() => 0);
    const m = await import('../../../middleware/security.js');
    generateApiKey = m.generateApiKey;
    hashApiKey = m.hashApiKey;
    authenticateApiKey = m.authenticateApiKey;
    requireTenantAccess = m.requireTenantAccess;
    requirePermission = m.requirePermission;
    rateLimitMiddleware = m.rateLimitMiddleware;
    securityHeaders = m.securityHeaders;
    twilioWebhookVerification = m.twilioWebhookVerification;
    errorHandler = m.errorHandler;
    validateAndSanitizeInput = m.validateAndSanitizeInput;
    validateInput = m.validateInput;
  });

  afterAll(() => {
    setIntervalSpy.mockRestore();
  });

  beforeEach(() => {
    getApiKeyByHash.mockReset();
    updateApiKeyLastUsed.mockReset();
    logSecurityEvent.mockReset().mockResolvedValue(undefined);
    recordRateLimitRequest.mockReset().mockResolvedValue(undefined);
    checkRateLimit.mockReset().mockResolvedValue({
      exceeded: false,
      remainingMinute: 99,
      remainingHour: 999,
      minuteCount: 1,
      hourCount: 1
    });
    twilioValidator.mockReset();
    twilioWebhookFactory.mockClear();
    formatErrorResponse.mockClear();
    logError.mockClear();
  });

  test('generateApiKey and hashApiKey are stable shape', () => {
    const key = generateApiKey();
    expect(key).toMatch(/^ak_[a-f0-9]{64}$/);
    const h = hashApiKey(key);
    expect(h).toMatch(/^[a-f0-9]{64}$/);
    expect(hashApiKey(key)).toBe(h);
  });

  test('authenticateApiKey returns 401 when no key', async () => {
    const req = { get: () => undefined, ip: '127.0.0.1' };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    await authenticateApiKey(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('authenticateApiKey returns 401 when key unknown', async () => {
    getApiKeyByHash.mockResolvedValueOnce(null);
    const req = {
      get: (h) => (h === 'X-API-Key' ? 'ak_bad' : undefined),
      ip: '127.0.0.1'
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    await authenticateApiKey(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json.mock.calls[0][0].code).toBe('INVALID_API_KEY');
    expect(next).not.toHaveBeenCalled();
  });

  test('authenticateApiKey attaches tenant and calls next', async () => {
    getApiKeyByHash.mockResolvedValueOnce({
      id: 7,
      client_key: 'tenant_a',
      permissions: ['read'],
      rate_limit_per_minute: 100,
      rate_limit_per_hour: 1000
    });
    const apiKey = 'ak_' + 'a'.repeat(64);
    const req = {
      get: (h) => (h === 'X-API-Key' ? apiKey : undefined),
      ip: '127.0.0.1'
    };
    const res = { status: jest.fn(), json: jest.fn() };
    const next = jest.fn();
    await authenticateApiKey(req, res, next);
    expect(updateApiKeyLastUsed).toHaveBeenCalledWith(7);
    expect(req.clientKey).toBe('tenant_a');
    expect(req.apiKey.id).toBe(7);
    expect(next).toHaveBeenCalledWith();
  });

  test('requireTenantAccess 400 when tenant missing', () => {
    const req = { params: {}, body: {}, clientKey: 'tenant_a' };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    requireTenantAccess(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  test('requireTenantAccess 403 on mismatch', () => {
    const req = { params: { tenantKey: 'other' }, body: {}, clientKey: 'tenant_a' };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    requireTenantAccess(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('requireTenantAccess calls next when match', () => {
    const req = { params: { tenantKey: 'tenant_a' }, body: {}, clientKey: 'tenant_a' };
    const res = { status: jest.fn(), json: jest.fn() };
    const next = jest.fn();
    requireTenantAccess(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  // The middleware must read the tenant id from any of the three idiomatic
  // path-param names used by routers across the repo. Routes that mount with
  // `:clientKey` / `:key` (most of /api/clients/*, /api/leads/recall/...)
  // rather than `:tenantKey` previously slipped through unchecked. These three
  // tests lock that fix in.
  test('requireTenantAccess accepts req.params.clientKey', () => {
    const req = { params: { clientKey: 'tenant_a' }, body: {}, clientKey: 'tenant_a' };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    requireTenantAccess(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  test('requireTenantAccess accepts req.params.key', () => {
    const req = { params: { key: 'tenant_a' }, body: {}, clientKey: 'tenant_a' };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    requireTenantAccess(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  test('requireTenantAccess 403s on cross-tenant via :clientKey', () => {
    const req = { params: { clientKey: 'tenant_b' }, body: {}, clientKey: 'tenant_a' };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    requireTenantAccess(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('requirePermission 401 without apiKey', () => {
    const mw = requirePermission('read');
    const req = {};
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    mw(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('requirePermission 403 without matching permission', () => {
    const mw = requirePermission('admin');
    const req = { apiKey: { permissions: ['read'] } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    mw(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('requirePermission passes with wildcard', () => {
    const mw = requirePermission('admin');
    const req = { apiKey: { permissions: ['*'] } };
    const res = { status: jest.fn(), json: jest.fn() };
    const next = jest.fn();
    mw(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  test('rateLimitMiddleware skips when no clientKey', async () => {
    const req = { path: '/x', ip: '1.1.1.1' };
    const res = { set: jest.fn() };
    const next = jest.fn();
    await rateLimitMiddleware(req, res, next);
    expect(next).toHaveBeenCalledWith();
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  test('rateLimitMiddleware applies when clientKey present', async () => {
    const req = {
      path: '/api/y',
      ip: '1.1.1.1',
      clientKey: 'c1',
      apiKey: { id: 1, rate_limit_per_minute: 100, rate_limit_per_hour: 1000 },
      get: () => undefined
    };
    const res = { set: jest.fn() };
    const next = jest.fn();
    await rateLimitMiddleware(req, res, next);
    expect(checkRateLimit).toHaveBeenCalled();
    expect(recordRateLimitRequest).toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith();
  });

  test('rateLimitMiddleware returns 429 when exceeded', async () => {
    checkRateLimit.mockResolvedValueOnce({
      exceeded: true,
      remainingMinute: 0,
      remainingHour: 0,
      minuteCount: 100,
      hourCount: 1
    });
    const req = {
      path: '/api/y',
      ip: '1.1.1.1',
      clientKey: 'c1',
      apiKey: { id: 1 },
      get: () => undefined
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn(), set: jest.fn() };
    const next = jest.fn();
    await rateLimitMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(next).not.toHaveBeenCalled();
  });

  test('rateLimitMiddleware allows request when rate limiting throws', async () => {
    checkRateLimit.mockRejectedValueOnce(new Error('db_down'));
    const req = {
      path: '/api/y',
      ip: '1.1.1.1',
      clientKey: 'c1',
      apiKey: { id: 1 },
      get: () => undefined
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn(), set: jest.fn() };
    const next = jest.fn();
    await rateLimitMiddleware(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  test('authenticateApiKey returns 500 when db helpers throw', async () => {
    getApiKeyByHash.mockRejectedValueOnce(new Error('db_down'));
    const apiKey = 'ak_' + 'a'.repeat(64);
    const req = {
      get: (h) => (h === 'X-API-Key' ? apiKey : undefined),
      ip: '127.0.0.1'
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    await authenticateApiKey(req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json.mock.calls[0][0].code).toBe('AUTH_ERROR');
    expect(next).not.toHaveBeenCalled();
  });

  test('securityHeaders sets headers and calls next', () => {
    const req = {};
    const res = { set: jest.fn() };
    const next = jest.fn();
    securityHeaders(req, res, next);
    expect(res.set).toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith();
  });

  test('validateAndSanitizeInput strips script tags', () => {
    const mw = validateAndSanitizeInput({});
    const req = { body: { x: '<script>x</script>y' }, query: {}, params: {} };
    const res = {};
    const next = jest.fn();
    mw(req, res, next);
    expect(req.body.x).toBe('y');
    expect(next).toHaveBeenCalledWith();
  });

  test('validateAndSanitizeInput sanitizes nested objects and arrays', () => {
    const mw = validateAndSanitizeInput({});
    const req = {
      body: { a: { b: ['ok', '<script>alert(1)</script>z'] } },
      query: { q: '<script>bad()</script>fine' },
      params: { id: '<script>1</script>2' }
    };
    const res = {};
    const next = jest.fn();
    mw(req, res, next);
    // Note: current sanitizer treats arrays as plain objects (index keys).
    expect(Object.values(req.body.a.b)).toEqual(['ok', 'z']);
    expect(req.query.q).toBe('fine');
    expect(req.params.id).toBe('2');
    expect(next).toHaveBeenCalledWith();
  });

  test('validateAndSanitizeInput returns 400 on sanitizer failure', () => {
    const mw = validateAndSanitizeInput({});
    const circular = {};
    circular.self = circular;
    const req = { body: circular, query: {}, params: {} };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    mw(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].code).toBe('INVALID_INPUT');
    expect(next).not.toHaveBeenCalled();
  });

  test('validateInput returns 400 for unknown schema', () => {
    const mw = validateInput('no_such_schema');
    const req = { body: {} };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    mw(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  test('validateInput passes for valid lead body', () => {
    const mw = validateInput('lead');
    const req = { body: { phone: '+441234567890' } };
    const res = { status: jest.fn(), json: jest.fn() };
    const next = jest.fn();
    mw(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  test('requirePermission returns 500 on unexpected error', () => {
    const mw = requirePermission('read');
    const req = {};
    Object.defineProperty(req, 'apiKey', {
      get() {
        throw new Error('boom');
      }
    });
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    mw(req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json.mock.calls[0][0].code).toBe('PERMISSION_ERROR');
    expect(next).not.toHaveBeenCalled();
  });

  test('twilioWebhookVerification skips verification when token missing (non-production)', async () => {
    const prevTok = process.env.TWILIO_AUTH_TOKEN;
    const prevNode = process.env.NODE_ENV;
    delete process.env.TWILIO_AUTH_TOKEN;
    process.env.NODE_ENV = 'test';

    const req = {
      protocol: 'https',
      originalUrl: '/webhooks/twilio/sms-inbound',
      body: { a: 1 },
      get: (h) => (h === 'host' ? 'example.test' : ''),
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    twilioWebhookVerification(req, res, next);
    expect(next).toHaveBeenCalledWith();

    process.env.TWILIO_AUTH_TOKEN = prevTok;
    process.env.NODE_ENV = prevNode;
  });

  test('twilioWebhookVerification returns 500 when token missing in production', async () => {
    const prevTok = process.env.TWILIO_AUTH_TOKEN;
    const prevNode = process.env.NODE_ENV;
    delete process.env.TWILIO_AUTH_TOKEN;
    process.env.NODE_ENV = 'production';

    const req = {
      protocol: 'https',
      originalUrl: '/webhooks/twilio/sms-inbound',
      body: { a: 1 },
      get: (h) => (h === 'host' ? 'example.test' : ''),
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    twilioWebhookVerification(req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json.mock.calls[0][0].code).toBe('MISSING_TWILIO_AUTH_TOKEN');
    expect(next).not.toHaveBeenCalled();

    process.env.TWILIO_AUTH_TOKEN = prevTok;
    process.env.NODE_ENV = prevNode;
  });

  test('twilioWebhookVerification returns 403 on invalid signature', async () => {
    const prev = process.env.TWILIO_AUTH_TOKEN;
    process.env.TWILIO_AUTH_TOKEN = 'tok';
    twilioValidator.mockReturnValue(false);

    const req = {
      protocol: 'https',
      originalUrl: '/webhooks/twilio/sms-inbound',
      body: { a: 1 },
      get: (h) => {
        if (h === 'host') return 'example.test';
        if (h === 'X-Twilio-Signature') return 'sig';
        return '';
      },
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    twilioWebhookVerification(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0].code).toBe('INVALID_SIGNATURE');
    expect(next).not.toHaveBeenCalled();

    process.env.TWILIO_AUTH_TOKEN = prev;
  });

  test('twilioWebhookVerification returns 403 when validator throws', async () => {
    const prev = process.env.TWILIO_AUTH_TOKEN;
    process.env.TWILIO_AUTH_TOKEN = 'tok';
    twilioValidator.mockImplementation(() => {
      throw new Error('validator_boom');
    });

    const req = {
      protocol: 'https',
      originalUrl: '/webhooks/twilio/sms-inbound',
      body: { a: 1 },
      get: (h) => {
        if (h === 'host') return 'example.test';
        if (h === 'X-Twilio-Signature') return 'sig';
        return '';
      },
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    twilioWebhookVerification(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0].code).toBe('TWILIO_VERIFY_ERROR');
    expect(next).not.toHaveBeenCalled();

    process.env.TWILIO_AUTH_TOKEN = prev;
  });

  test('errorHandler hides internal errors in production for 5xx', async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const err = new Error('boom');
    err.statusCode = 500;
    const req = {
      id: 'r1',
      path: '/x',
      method: 'GET',
      url: '/x',
      get: () => '',
      ip: '1.1.1.1',
      clientKey: 'c1',
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    await errorHandler(err, req, res, next);

    expect(logError).toHaveBeenCalled();
    expect(formatErrorResponse).toHaveBeenCalled();
    expect(formatErrorResponse.mock.calls[0][1]).toBeNull();
    expect(res.status).toHaveBeenCalledWith(500);

    process.env.NODE_ENV = prev;
  });

  test('errorHandler exposes operational errors (4xx) even in production', async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const err = new Error('bad');
    err.statusCode = 400;
    const req = {
      id: 'r1',
      path: '/x',
      method: 'GET',
      url: '/x',
      get: () => '',
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    await errorHandler(err, req, res, next);
    expect(formatErrorResponse.mock.calls[0][1]).toBe(req);
    expect(res.status).toHaveBeenCalledWith(400);

    process.env.NODE_ENV = prev;
  });
});
