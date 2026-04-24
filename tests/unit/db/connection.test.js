import { describe, test, expect, jest, beforeAll } from '@jest/globals';

const PoolMock = jest.fn().mockImplementation(() => ({
  query: jest.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
}));

jest.unstable_mockModule('pg', () => ({
  default: { Pool: PoolMock },
  Pool: PoolMock,
}));

describe('db/connection.js', () => {
  let resolvePgSsl;
  let resolveStatementTimeoutMs;
  let createPostgresPoolAndLimiter;
  let testPostgresPoolConnection;

  beforeAll(async () => {
    ({
      resolvePgSsl,
      resolveStatementTimeoutMs,
      createPostgresPoolAndLimiter,
      testPostgresPoolConnection,
    } = await import('../../../db/connection.js'));
  });

  test('resolvePgSsl disables SSL for localhost', () => {
    expect(resolvePgSsl('postgresql://u:p@localhost:5432/db', { PG_FORCE_SSL: undefined })).toBe(false);
  });

  test('resolvePgSsl keeps SSL object for non-local hosts', () => {
    const ssl = resolvePgSsl('postgresql://u:p@db.example.com:5432/db', { PG_FORCE_SSL: undefined });
    expect(ssl).toEqual(expect.objectContaining({ rejectUnauthorized: false }));
  });

  test('resolveStatementTimeoutMs defaults and env override', () => {
    expect(resolveStatementTimeoutMs({})).toBe(20000);
    expect(resolveStatementTimeoutMs({ RENDER: 'true' })).toBe(60000);
    expect(resolveStatementTimeoutMs({ DB_STATEMENT_TIMEOUT_MS: '45000' })).toBe(45000);
    expect(resolveStatementTimeoutMs({ DB_STATEMENT_TIMEOUT_MS: '500' })).toBe(20000);
    expect(resolveStatementTimeoutMs({ DB_STATEMENT_TIMEOUT_MS: '400000' })).toBe(20000);
  });

  test('createPostgresPoolAndLimiter wires pool and optional limiter', async () => {
    PoolMock.mockClear();
    const { pool, pgQueryLimiter, maxConnections } = createPostgresPoolAndLimiter(
      'postgresql://u:p@db.example.com:5432/db',
      { RENDER: 'true', DB_POOL_MAX: '4', DB_QUERY_CONCURRENCY: '2' },
    );
    expect(PoolMock).toHaveBeenCalled();
    expect(PoolMock.mock.calls[0][0].statement_timeout).toBe(60000);
    expect(maxConnections).toBe(4);
    expect(pgQueryLimiter).not.toBeNull();
    await testPostgresPoolConnection(pool, 5000);
    expect(pool.query).toHaveBeenCalled();
  });

  test('createPostgresPoolAndLimiter passes DB_STATEMENT_TIMEOUT_MS to pool', () => {
    PoolMock.mockClear();
    createPostgresPoolAndLimiter('postgresql://u:p@db.example.com:5432/db', {
      DB_STATEMENT_TIMEOUT_MS: '88000',
      DB_POOL_MAX: '4',
    });
    expect(PoolMock.mock.calls[0][0].statement_timeout).toBe(88000);
  });
});
