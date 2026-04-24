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
  let createPostgresPoolAndLimiter;
  let testPostgresPoolConnection;

  beforeAll(async () => {
    ({ resolvePgSsl, createPostgresPoolAndLimiter, testPostgresPoolConnection } = await import(
      '../../../db/connection.js'
    ));
  });

  test('resolvePgSsl disables SSL for localhost', () => {
    expect(resolvePgSsl('postgresql://u:p@localhost:5432/db', { PG_FORCE_SSL: undefined })).toBe(false);
  });

  test('resolvePgSsl keeps SSL object for non-local hosts', () => {
    const ssl = resolvePgSsl('postgresql://u:p@db.example.com:5432/db', { PG_FORCE_SSL: undefined });
    expect(ssl).toEqual(expect.objectContaining({ rejectUnauthorized: false }));
  });

  test('createPostgresPoolAndLimiter wires pool and optional limiter', async () => {
    PoolMock.mockClear();
    const { pool, pgQueryLimiter, maxConnections } = createPostgresPoolAndLimiter(
      'postgresql://u:p@db.example.com:5432/db',
      { RENDER: 'true', DB_POOL_MAX: '4', DB_QUERY_CONCURRENCY: '2' },
    );
    expect(PoolMock).toHaveBeenCalled();
    expect(maxConnections).toBe(4);
    expect(pgQueryLimiter).not.toBeNull();
    await testPostgresPoolConnection(pool, 5000);
    expect(pool.query).toHaveBeenCalled();
  });
});
