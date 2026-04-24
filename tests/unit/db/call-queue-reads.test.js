import { describe, test, expect, jest, beforeAll } from '@jest/globals';

describe('db/call-queue-reads.js', () => {
  let callQueueReads;

  beforeAll(async () => {
    callQueueReads = await import('../../../db/call-queue-reads.js');
  });

  test('getPendingCalls passes limit and returns rows', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [{ id: 1 }] });
    const rows = await callQueueReads.getPendingCalls(query, 7);
    expect(rows).toEqual([{ id: 1 }]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('WITH due AS'), [7]);
  });

  test('getCallQueueByTenant passes client key and limit', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    await callQueueReads.getCallQueueByTenant(query, 'c1', 20);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('FROM call_queue'), ['c1', 20]);
  });

  test('getCallQueueByPhone passes phone and limit', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    await callQueueReads.getCallQueueByPhone(query, 'c1', '+1', 5);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('lead_phone = $2'), ['c1', '+1', 5]);
  });
});
