import { describe, expect, test, jest } from '@jest/globals';
import { createApiKeysRateLimitDomain } from '../../../db/domains/api-keys-rate-limit.js';

describe('db/domains/api-keys-rate-limit', () => {
  test('createApiKeysRateLimitDomain requires query function', () => {
    expect(() => createApiKeysRateLimitDomain({})).toThrow(/requires query/);
  });

  test('updateApiKeyLastUsed calls query', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const d = createApiKeysRateLimitDomain({ query });
    await d.updateApiKeyLastUsed(42);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('UPDATE api_keys'), [42]);
  });

  test('getApiKeysByClient returns rows', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [{ id: 1 }] });
    const d = createApiKeysRateLimitDomain({ query });
    const rows = await d.getApiKeysByClient('ck');
    expect(rows).toEqual([{ id: 1 }]);
    expect(query.mock.calls[0][1]).toEqual(['ck']);
  });

  test('checkRateLimit computes exceeded and remaining', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [{ count: '3' }] })
      .mockResolvedValueOnce({ rows: [{ count: '1' }] });
    const d = createApiKeysRateLimitDomain({ query });
    const r = await d.checkRateLimit({
      clientKey: 'c',
      apiKeyId: 1,
      endpoint: '/x',
      ipAddress: '1.1.1.1',
      limitPerMinute: 5,
      limitPerHour: 10
    });
    expect(r.exceeded).toBe(false);
    expect(r.minuteCount).toBe(3);
    expect(r.hourCount).toBe(1);
    expect(r.remainingMinute).toBe(2);
    expect(r.remainingHour).toBe(9);
  });

  test('checkRateLimit exceeded when over limits', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [{ count: '10' }] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] });
    const d = createApiKeysRateLimitDomain({ query });
    const r = await d.checkRateLimit({
      clientKey: 'c',
      apiKeyId: null,
      endpoint: '/x',
      ipAddress: null,
      limitPerMinute: 5,
      limitPerHour: 100
    });
    expect(r.exceeded).toBe(true);
  });

  test('recordRateLimitRequest and cleanupOldRateLimitRecords call query', async () => {
    const query = jest.fn().mockResolvedValue({});
    const d = createApiKeysRateLimitDomain({ query });
    await d.recordRateLimitRequest({
      clientKey: 'c',
      apiKeyId: 2,
      endpoint: '/e',
      ipAddress: '::1'
    });
    await d.cleanupOldRateLimitRecords(48);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO rate_limit_tracking'), [
      'c',
      2,
      '/e',
      '::1'
    ]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM rate_limit_tracking'));
  });
});
