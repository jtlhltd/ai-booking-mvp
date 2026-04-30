import { describe, test, expect, jest, beforeEach } from '@jest/globals';

describe('lib/request-queue bounded retries', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('a consistently failing item reaches failed after 3 attempts', async () => {
    let attempt = 0;
    let status = 'pending';
    let scheduledFor = new Date(Date.now() - 1000);

    const calls = [];

    const query = jest.fn(async (sql, params = []) => {
      const s = String(sql);
      calls.push({ sql: s, params });

      // Claim lane (postgres)
      if (s.includes('FOR UPDATE SKIP LOCKED') && s.includes('RETURNING q.*')) {
        if (status !== 'pending') return { rows: [] };
        // Only return work if it's due.
        if (scheduledFor.getTime() > Date.now()) return { rows: [] };
        return {
          rows: [
            {
              id: 1,
              client_key: 'c1',
              call_type: 'sms_send',
              call_data: JSON.stringify({ to: '+447700900000', message: 'hi' }),
              retry_attempt: attempt,
              status,
              scheduled_for: scheduledFor
            }
          ]
        };
      }

      // Retry reschedule update
      if (s.includes('UPDATE call_queue') && s.includes("SET status = 'pending'") && s.includes('retry_attempt')) {
        attempt = Number(params[0] || 0);
        scheduledFor = params[1] instanceof Date ? params[1] : new Date(params[1]);
        status = 'pending';
        return { rows: [] };
      }

      // Terminal fail update
      if (s.includes('UPDATE call_queue') && s.includes("SET status = 'failed'")) {
        status = 'failed';
        attempt = Number(params[1] || attempt);
        return { rows: [] };
      }

      // Mark completed (should never happen in this test)
      if (s.includes('UPDATE call_queue') && s.includes("SET status = 'completed'")) {
        status = 'completed';
        return { rows: [] };
      }

      // Non-postgres claim path reads
      if (s.includes('SELECT *') && s.includes('FROM call_queue')) return { rows: [] };

      return { rows: [] };
    });

    jest.unstable_mockModule('../../../db.js', () => ({
      query,
      dbType: 'postgres'
    }));

    jest.unstable_mockModule('../../../lib/messaging-service.js', () => ({
      default: {
        sendSMS: jest.fn(async () => {
          throw new Error('boom');
        })
      }
    }));

    const { processQueue } = await import('../../../lib/request-queue.js');

    // Each call simulates a separate cron tick; the reschedule writes keep it due.
    await processQueue({ maxConcurrent: 1, maxProcess: 10 });
    // Force due-now again for the next tick.
    scheduledFor = new Date(Date.now() - 1000);
    await processQueue({ maxConcurrent: 1, maxProcess: 10 });
    scheduledFor = new Date(Date.now() - 1000);
    await processQueue({ maxConcurrent: 1, maxProcess: 10 });

    // Third failure should transition to failed (attempt 3).
    expect(status).toBe('failed');
    expect(attempt).toBeGreaterThanOrEqual(3);

    const failedWrites = calls.filter((c) => c.sql.includes("SET status = 'failed'"));
    expect(failedWrites.length).toBe(1);
  });
});

