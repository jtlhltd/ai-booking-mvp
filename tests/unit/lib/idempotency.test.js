import { describe, test, expect, jest, beforeEach } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
});

describe('lib/idempotency', () => {
  test('generateIdempotencyKey is stable for same input', async () => {
    const { generateIdempotencyKey } = await import('../../../lib/idempotency.js');
    const k1 = generateIdempotencyKey('c1', 'op', { a: 1 });
    const k2 = generateIdempotencyKey('c1', 'op', { a: 1 });
    expect(k1).toBe(k2);
    expect(k1).toMatch(/^c1:op:/);
  });

  test('checkIdempotency returns isDuplicate false when no rows', async () => {
    jest.unstable_mockModule('../../../db.js', () => ({
      query: jest.fn(async () => ({ rows: [] })),
    }));
    const { checkIdempotency } = await import('../../../lib/idempotency.js');
    const res = await checkIdempotency('c1', 'op', 'k', 1000);
    expect(res).toEqual({ isDuplicate: false });
  });

  test('checkIdempotency returns duplicate when row exists', async () => {
    jest.unstable_mockModule('../../../db.js', () => ({
      query: jest.fn(async () => ({
        rows: [{ client_key: 'c1', key: 'k', created_at: new Date(Date.now() - 2500).toISOString() }],
      })),
    }));
    const { checkIdempotency } = await import('../../../lib/idempotency.js');
    const res = await checkIdempotency('c1', 'op', 'k', 10000);
    expect(res.isDuplicate).toBe(true);
    expect(res.originalRequest).toEqual(expect.objectContaining({ key: 'k' }));
    expect(res.timeSinceOriginal).toBeGreaterThan(0);
    expect(res.message).toMatch(/Duplicate request detected/);
  });

  test('checkIdempotency fails open on query error', async () => {
    jest.unstable_mockModule('../../../db.js', () => ({
      query: jest.fn(async () => {
        throw new Error('db_down');
      }),
    }));
    const { checkIdempotency } = await import('../../../lib/idempotency.js');
    const res = await checkIdempotency('c1', 'op', 'k', 10000);
    expect(res).toEqual(expect.objectContaining({ isDuplicate: false, error: 'db_down' }));
  });

  test('recordIdempotency returns success true when insert ok', async () => {
    const query = jest.fn(async () => ({ rowCount: 1 }));
    jest.unstable_mockModule('../../../db.js', () => ({ query }));
    const { recordIdempotency } = await import('../../../lib/idempotency.js');
    const res = await recordIdempotency('c1', 'op', 'k');
    expect(res).toEqual({ success: true });
    expect(query).toHaveBeenCalled();
  });

  test('recordIdempotency returns success false when insert fails', async () => {
    jest.unstable_mockModule('../../../db.js', () => ({
      query: jest.fn(async () => {
        throw new Error('insert_fail');
      }),
    }));
    const { recordIdempotency } = await import('../../../lib/idempotency.js');
    const res = await recordIdempotency('c1', 'op', 'k');
    expect(res).toEqual({ success: false, error: 'insert_fail' });
  });

  test('idempotencyMiddleware returns 409 on duplicate', async () => {
    jest.unstable_mockModule('../../../db.js', () => ({
      query: jest.fn(async () => ({
        rows: [{ created_at: new Date(Date.now() - 1000).toISOString() }],
      })),
    }));
    const { idempotencyMiddleware } = await import('../../../lib/idempotency.js');

    const req = { body: { a: 1 }, clientKey: 'c1' };
    const res = {
      status: jest.fn(() => res),
      json: jest.fn(() => res),
    };
    const next = jest.fn();

    await idempotencyMiddleware('op')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(next).not.toHaveBeenCalled();
  });

  test('idempotencyMiddleware sets key + calls next when not duplicate', async () => {
    jest.unstable_mockModule('../../../db.js', () => ({
      query: jest.fn(async () => ({ rows: [] })),
    }));
    const { idempotencyMiddleware } = await import('../../../lib/idempotency.js');

    const req = { body: { a: 1 }, tenantKey: 't1' };
    const res = { status: jest.fn(() => res), json: jest.fn(() => res) };
    const next = jest.fn();

    await idempotencyMiddleware('op')(req, res, next);
    expect(req.idempotencyKey).toMatch(/^t1:op:/);
    expect(req.idempotencyOperation).toBe('op');
    expect(next).toHaveBeenCalled();
  });

  test('idempotencyMiddleware fails open on error and calls next', async () => {
    jest.unstable_mockModule('../../../db.js', () => ({
      query: jest.fn(async () => {
        throw new Error('db_down');
      }),
    }));
    const { idempotencyMiddleware } = await import('../../../lib/idempotency.js');

    const req = { body: { a: 1 }, tenantKey: 't1' };
    const res = { status: jest.fn(() => res), json: jest.fn(() => res) };
    const next = jest.fn();

    await idempotencyMiddleware('op')(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

