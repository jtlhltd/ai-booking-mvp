import { describe, expect, test, jest, beforeEach } from '@jest/globals';

const query = jest.fn();

describe('db/call-quality-reads', () => {
  beforeEach(() => {
    query.mockReset();
  });

  test('getCallsByPhone returns rows', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 1, call_id: 'c1' }] });
    const mod = await import('../../../db/call-quality-reads.js');
    const rows = await mod.getCallsByPhone(query, 't1', '+1555', 10);
    expect(rows).toEqual([{ id: 1, call_id: 'c1' }]);
  });

  test('getRecentCallsCount parses count', async () => {
    query.mockResolvedValueOnce({ rows: [{ count: '12' }] });
    const mod = await import('../../../db/call-quality-reads.js');
    expect(await mod.getRecentCallsCount(query, 't1', 30)).toBe(12);
  });

  test('getCallQualityMetrics returns defaults when empty', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const mod = await import('../../../db/call-quality-reads.js');
    const m = await mod.getCallQualityMetrics(query, 't1', 7, {
      getCallAnalyticsFloorIso: async () => '2020-01-01T00:00:00.000Z'
    });
    expect(m.total_calls).toBe(0);
  });
});
