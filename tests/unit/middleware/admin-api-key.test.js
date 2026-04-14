import { describe, test, expect, afterEach, jest } from '@jest/globals';
import { enforceAdminApiKeyIfConfigured } from '../../../middleware/admin-api-key.js';

describe('enforceAdminApiKeyIfConfigured', () => {
  const prevEnforce = process.env.ENFORCE_ADMIN_API_KEY;
  const prevApiKey = process.env.API_KEY;

  afterEach(() => {
    process.env.ENFORCE_ADMIN_API_KEY = prevEnforce;
    process.env.API_KEY = prevApiKey;
  });

  test('allows non-admin paths without checking key', () => {
    process.env.ENFORCE_ADMIN_API_KEY = '1';
    process.env.API_KEY = 'secret';
    const req = { path: '/api/health', get: () => null };
    const res = { status: jest.fn(), json: jest.fn() };
    const next = jest.fn();
    enforceAdminApiKeyIfConfigured(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('when enforce is off, allows /api/admin without key', () => {
    process.env.ENFORCE_ADMIN_API_KEY = '0';
    process.env.API_KEY = 'secret';
    const req = { path: '/api/admin/system-health', get: () => null };
    const res = { status: jest.fn(), json: jest.fn() };
    const next = jest.fn();
    enforceAdminApiKeyIfConfigured(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('when enforce is on and API_KEY set, rejects missing X-API-Key', () => {
    process.env.ENFORCE_ADMIN_API_KEY = 'true';
    process.env.API_KEY = 'expected-key';
    const req = { path: '/api/admin/foo', get: () => undefined };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    enforceAdminApiKeyIfConfigured(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
  });

  test('when enforce is on, accepts matching X-API-Key', () => {
    process.env.ENFORCE_ADMIN_API_KEY = '1';
    process.env.API_KEY = 'expected-key';
    const req = { path: '/api/admin/foo', get: (h) => (h === 'X-API-Key' ? 'expected-key' : null) };
    const res = { status: jest.fn(), json: jest.fn() };
    const next = jest.fn();
    enforceAdminApiKeyIfConfigured(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('when API_KEY unset, does not enforce even if ENFORCE flag set', () => {
    process.env.ENFORCE_ADMIN_API_KEY = '1';
    delete process.env.API_KEY;
    const req = { path: '/api/admin/foo', get: () => null };
    const res = { status: jest.fn(), json: jest.fn() };
    const next = jest.fn();
    enforceAdminApiKeyIfConfigured(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
