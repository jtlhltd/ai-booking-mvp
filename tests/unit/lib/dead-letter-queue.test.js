import { describe, expect, test, jest, beforeEach } from '@jest/globals';

const query = jest.fn();

jest.unstable_mockModule('../../../db.js', () => ({ query }));

const sendCriticalAlert = jest.fn(async () => {});

jest.unstable_mockModule('../../../lib/error-monitoring.js', () => ({ sendCriticalAlert }));

describe('dead-letter-queue', () => {
  beforeEach(() => {
    jest.resetModules();
    query.mockReset();
    sendCriticalAlert.mockReset();
  });

  test('moveToDLQ inserts and alerts for booking', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 99 }] });
    const { moveToDLQ } = await import('../../../lib/dead-letter-queue.js');
    const r = await moveToDLQ({
      clientKey: 'c1',
      originalTable: 'x',
      originalId: 1,
      operationType: 'booking',
      payload: { a: 1 },
      errorHistory: [],
      failureReason: 'f',
      retryCount: 3,
      maxRetries: 5
    });
    expect(r.success).toBe(true);
    expect(sendCriticalAlert).toHaveBeenCalled();
  });

  test('moveToDLQ returns error on insert failure', async () => {
    query.mockRejectedValueOnce(new Error('db'));
    const { moveToDLQ } = await import('../../../lib/dead-letter-queue.js');
    const r = await moveToDLQ({
      clientKey: 'c1',
      originalTable: 'x',
      originalId: 1,
      operationType: 'other',
      payload: {},
      failureReason: 'x',
      retryCount: 0,
      maxRetries: 1
    });
    expect(r.success).toBe(false);
  });

  test('getDLQItems maps rows and applies filters', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          client_key: 'c',
          operation_type: 't',
          payload: '{"a":1}',
          error_history: '[]',
          failure_reason: 'r',
          retry_count: 0,
          max_retries: 3,
          first_failed_at: null,
          last_attempted_at: null,
          resolved_at: null,
          resolution_notes: null,
          created_at: 't'
        }
      ]
    });
    const { getDLQItems } = await import('../../../lib/dead-letter-queue.js');
    const items = await getDLQItems({ clientKey: 'c', operationType: 't', resolved: false, limit: 10 });
    expect(items[0].payload).toEqual({ a: 1 });
  });

  test('retryDLQItem succeeds and resolves', async () => {
    query
      .mockResolvedValueOnce({
        rows: [
          {
            id: 5,
            payload: '{"k":1}',
            error_history: '[]'
          }
        ]
      })
      .mockResolvedValueOnce({ rows: [] });
    const { retryDLQItem } = await import('../../../lib/dead-letter-queue.js');
    const r = await retryDLQItem(5, async () => {});
    expect(r.success).toBe(true);
  });

  test('retryDLQItem records failure on retry throw', async () => {
    query
      .mockResolvedValueOnce({
        rows: [{ id: 6, payload: '{}', error_history: '[]' }]
      })
      .mockResolvedValueOnce({ rows: [] });
    const { retryDLQItem } = await import('../../../lib/dead-letter-queue.js');
    const r = await retryDLQItem(6, async () => {
      throw new Error('bad');
    });
    expect(r.success).toBe(false);
  });

  test('resolveDLQItem and cleanupDLQ', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const { resolveDLQItem, cleanupDLQ } = await import('../../../lib/dead-letter-queue.js');
    await expect(resolveDLQItem(1, 'done')).resolves.toEqual({ success: true });
    query.mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 2 }] });
    const c = await cleanupDLQ();
    expect(c.deleted).toBe(2);
  });
});
