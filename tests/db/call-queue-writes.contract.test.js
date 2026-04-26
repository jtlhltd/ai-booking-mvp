import { describe, test, expect, jest } from '@jest/globals';
import { updateCallQueueStatus, clearCallQueue } from '../../db/call-queue-writes.js';

describe('db/call-queue-writes', () => {
  test('updateCallQueueStatus invokes query with id and status', async () => {
    const query = jest.fn(async () => ({ rowCount: 1 }));
    await updateCallQueueStatus(query, 42, 'completed');
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0];
    expect(String(sql)).toMatch(/UPDATE call_queue/i);
    expect(params).toEqual([42, 'completed']);
  });

  test('clearCallQueue with clientKey builds DELETE with filters', async () => {
    const query = jest.fn(async () => ({ rowCount: 3 }));
    const n = await clearCallQueue(query, { clientKey: 'acme' });
    expect(n).toBe(3);
    expect(String(query.mock.calls[0][0])).toMatch(/DELETE FROM call_queue/);
    expect(String(query.mock.calls[0][0])).toMatch(/client_key/);
  });
});
