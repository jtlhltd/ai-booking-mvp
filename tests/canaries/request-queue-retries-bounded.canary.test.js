/**
 * Canary for Intent Contract: queue.request-queue-retries-bounded
 *
 * `lib/request-queue.js` processes non-vapi `call_queue` rows (sms_send,
 * lead_import, etc). When the per-item handler throws, the worker MUST
 * bound the retry counter — three failures and the row transitions to
 * `status='failed'`, never an unbounded "pending + reschedule" loop.
 *
 * The audit-backlog P0 regression to guard against:
 *   `const retryAttempt = (item.retry_attempt || 0) + 1`
 *   ...without ever writing `retry_attempt` back to the row, so
 *   `retryAttempt` was always 1 and the row stayed pending forever.
 *
 * Asserts:
 *   - First two failures: row is rescheduled with status='pending' and
 *     retry_attempt is incremented (1, 2).
 *   - Third failure: row transitions to status='failed' (not 'pending').
 *   - retry_attempt is always written back; never just used in arithmetic.
 */
import { describe, expect, test, jest, beforeEach } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
});

describe('canary: queue.request-queue-retries-bounded', () => {
  test('non-vapi call_queue rows transition to failed after 3 attempts', async () => {
    const updates = [];

    // Simulate a non-vapi row that fails its handler. Each call to processQueue
    // claims this single row, which always throws an unrecognized requestType
    // error from lib/request-queue.js#processRequest (`Unknown request type`).
    // The first two failures should reschedule (pending + retry_attempt++); the
    // third should mark it 'failed'.
    let row = {
      id: 42,
      client_key: 'tenant-a',
      lead_phone: 'queue',
      call_type: 'unknown_type', // forces processRequest to throw
      call_data: JSON.stringify({}),
      status: 'pending',
      retry_attempt: 0
    };

    jest.unstable_mockModule('../../db.js', () => ({
      query: jest.fn(async (sql, params) => {
        const s = String(sql).toLowerCase();
        // The Postgres path uses a CTE; the SQLite/JSON path uses a plain SELECT.
        // Both end up returning the row from `call_queue`.
        if (s.includes('update call_queue') && s.includes('returning')) {
          // Atomic claim: status -> processing, return current row snapshot.
          if (row.status === 'pending') {
            row = { ...row, status: 'processing' };
            return { rows: [row] };
          }
          return { rows: [] };
        }
        if (s.includes('select') && s.includes('call_queue') && s.includes('pending')) {
          if (row.status === 'pending') return { rows: [row] };
          return { rows: [] };
        }
        if (s.includes('update call_queue')) {
          // params for the failure path are: [retryAttempt, nextRetry, id] (pending)
          // or [id, retryAttempt] (failed). Detect by SQL fragment.
          const update = { sql: s, params };
          if (s.includes("status = 'pending'") && s.includes('retry_attempt')) {
            row = {
              ...row,
              status: 'pending',
              retry_attempt: params[0]
            };
          } else if (s.includes("status = 'failed'")) {
            row = {
              ...row,
              status: 'failed',
              retry_attempt: params[1]
            };
          } else if (s.includes("status = 'processing'")) {
            row = { ...row, status: 'processing' };
          }
          updates.push(update);
          return { rows: [{ id: row.id }] };
        }
        return { rows: [] };
      }),
      dbType: 'sqlite',
      getFullClient: jest.fn(async () => null)
    }));

    const { processQueue } = await import('../../lib/request-queue.js');

    // Drain three attempts. Each call observes a single row and the handler
    // throws `Unknown request type`, which routes through the failure branch.
    await processQueue();
    expect(row.status).toBe('pending');
    expect(row.retry_attempt).toBe(1);

    await processQueue();
    expect(row.status).toBe('pending');
    expect(row.retry_attempt).toBe(2);

    await processQueue();
    expect(row.status).toBe('failed');
    expect(row.retry_attempt).toBe(3);

    // After the row is failed, the next claim must yield nothing — no
    // resurrection back to pending.
    const trailing = await processQueue();
    expect(trailing).toEqual({ processed: 0, queued: 0 });
    expect(row.status).toBe('failed');
  });
});
