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

jest.unstable_mockModule('../../../db.js', () => ({
  getApiKeyByHash,
  updateApiKeyLastUsed,
  logSecurityEvent,
  checkRateLimit,
  recordRateLimitRequest,
  cleanupOldRateLimitRecords
}));

let generateApiKey;
let hashApiKey;
let authenticateApiKey;
let requireTenantAccess;
let requirePermission;
let rateLimitMiddleware;
let securityHeaders;
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
});
