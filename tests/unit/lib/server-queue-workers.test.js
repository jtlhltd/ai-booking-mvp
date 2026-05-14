import { describe, test, expect, jest, beforeEach } from '@jest/globals';

/**
 * lib/server-queue-workers remains excluded from collectCoverageFrom (see jest.config.js).
 * Incremental tests document safe entry points before eventual inclusion + heavier mocks.
 */
describe('lib/server-queue-workers', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('processRetryQueue returns early when no pending retries', async () => {
    const query = jest.fn(async () => ({ rowCount: 0 }));
    const getPendingRetries = jest.fn(async () => []);

    jest.unstable_mockModule('../../../db.js', () => ({
      query,
      poolQuerySelect: jest.fn(async () => ({ rows: [] })),
      getFullClient: jest.fn(async () => null),
      listFullClients: jest.fn(async () => []),
      addToCallQueue: jest.fn(async () => {}),
      smearCallQueueScheduledFor: jest.fn(async () => {}),
      invalidateClientCache: jest.fn(async () => {}),
      getPendingRetries,
      updateRetryStatus: jest.fn(async () => {}),
    }));

    const { processRetryQueue } = await import('../../../lib/server-queue-workers.js');
    await processRetryQueue();

    expect(query).toHaveBeenCalled();
    expect(getPendingRetries).toHaveBeenCalled();
  });

  test('processCallQueue returns when no pending calls', async () => {
    const query = jest.fn(async () => ({ rowCount: 0, rows: [] }));
    jest.unstable_mockModule('../../../db.js', () => ({
      query,
      poolQuerySelect: jest.fn(async () => ({ rows: [] })),
      getFullClient: jest.fn(async () => null),
      listFullClients: jest.fn(async () => []),
      addToCallQueue: jest.fn(async () => {}),
      smearCallQueueScheduledFor: jest.fn((d) => d),
      invalidateClientCache: jest.fn(async () => {}),
      getPendingCalls: jest.fn(async () => []),
      getPendingRetries: jest.fn(async () => []),
      updateRetryStatus: jest.fn(async () => {}),
      updateCallQueueStatus: jest.fn(async () => {}),
      cancelDuplicatePendingCalls: jest.fn(async () => {})
    }));

    const { processCallQueue } = await import('../../../lib/server-queue-workers.js');
    await processCallQueue();

    expect(query).toHaveBeenCalled();
  });

  test('processRetryQueue defers vapi_call retries outside business hours (updates scheduled_for, no status transitions)', async () => {
    const query = jest.fn(async () => ({ rowCount: 0, rows: [] }));
    const getPendingRetries = jest.fn(async () => [
      {
        id: 10,
        retry_type: 'vapi_call',
        client_key: 'c1',
        lead_phone: '+15550001111',
        retry_attempt: 0,
        max_retries: 3,
        retry_data: '{}'
      }
    ]);
    const updateRetryStatus = jest.fn(async () => {});
    const getFullClient = jest.fn(async () => ({ clientKey: 'c1', timezone: 'UTC', booking: { timezone: 'UTC' } }));

    jest.unstable_mockModule('../../../db.js', () => ({
      query,
      poolQuerySelect: jest.fn(async () => ({ rows: [] })),
      getFullClient,
      listFullClients: jest.fn(async () => []),
      addToCallQueue: jest.fn(async () => {}),
      smearCallQueueScheduledFor: jest.fn(async () => {}),
      invalidateClientCache: jest.fn(async () => {}),
      getPendingRetries,
      updateRetryStatus,
      claimOutboundWeekdayJourneySlot: jest.fn(async () => ({ ok: true })),
    }));
    jest.unstable_mockModule('../../../lib/server-queue-workers-shared.js', () => ({
      TIMEZONE: 'UTC',
      isBusinessHours: jest.fn(() => false),
      getNextBusinessHour: jest.fn(() => new Date('2030-01-01T10:00:00.000Z')),
      pickTimezone: jest.fn(() => 'UTC')
    }));

    const { processRetryQueue } = await import('../../../lib/server-queue-workers.js');
    await processRetryQueue();

    // should update scheduled_for and continue, without marking processing/completed/failed
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE retry_queue SET scheduled_for'),
      [new Date('2030-01-01T10:00:00.000Z'), 10]
    );
    expect(updateRetryStatus).not.toHaveBeenCalled();
  });

  test('processRetryQueue schedules retry backoff on processing error (increments attempt + sets scheduled_for)', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
    jest.spyOn(global.Math, 'random').mockReturnValue(0);

    const query = jest.fn(async () => ({ rowCount: 0, rows: [] }));
    const getPendingRetries = jest.fn(async () => [
      {
        id: 11,
        retry_type: 'sheet_patch',
        client_key: 'c1',
        lead_phone: '+15550002222',
        retry_attempt: 0,
        max_retries: 3,
        retry_data: JSON.stringify({ rowNumber: 2, patch: { Status: 'x' } }),
      },
    ]);
    const updateRetryStatus = jest.fn(async () => {});

    jest.unstable_mockModule('../../../db.js', () => ({
      query,
      poolQuerySelect: jest.fn(async () => ({ rows: [] })),
      getFullClient: jest.fn(async () => ({
        clientKey: 'c1',
        timezone: 'UTC',
        booking: { timezone: 'UTC' },
        vapi_json: { logisticsSheetId: 'sheet_mock_1' },
      })),
      listFullClients: jest.fn(async () => []),
      addToCallQueue: jest.fn(async () => {}),
      smearCallQueueScheduledFor: jest.fn(async () => {}),
      invalidateClientCache: jest.fn(async () => {}),
      getPendingRetries,
      updateRetryStatus,
      claimOutboundWeekdayJourneySlot: jest.fn(async () => ({ ok: true })),
    }));
    jest.unstable_mockModule('../../../lib/server-queue-workers-shared.js', () => ({
      TIMEZONE: 'UTC',
      isBusinessHours: jest.fn(() => true),
      getNextBusinessHour: jest.fn(() => new Date('2030-01-01T10:00:00.000Z')),
      pickTimezone: jest.fn(() => 'UTC')
    }));

    // Force sheet patch processing to throw.
    jest.unstable_mockModule('../../../sheets.js', () => ({
      patchLogisticsRowByNumber: jest.fn(async () => {
        throw new Error('boom');
      }),
    }));

    const { processRetryQueue } = await import('../../../lib/server-queue-workers.js');
    const p = processRetryQueue();
    // processRetryQueue's worker intentionally sleeps up to ~350ms before starting;
    // under fake timers we must advance time to let it progress.
    await jest.advanceTimersByTimeAsync(500);
    await p;

    // processing starts, then catch schedules backoff via query UPDATE (not updateRetryStatus('failed'))
    expect(updateRetryStatus).toHaveBeenCalledWith(11, 'processing');
    expect(updateRetryStatus).not.toHaveBeenCalledWith(11, 'failed');

    const updateCalls = query.mock.calls.filter((c) => String(c[0]).includes('UPDATE retry_queue') && String(c[0]).includes('retry_attempt'));
    expect(updateCalls.length).toBe(1);
    const [_sql, params] = updateCalls[0];
    expect(params[0]).toBe(1); // nextAttempt
    expect(params[2]).toBe(11);
    const scheduledForIso = params[1];
    // base 5 minutes, jitter 0 seconds because Math.random mocked to 0
    expect(new Date(scheduledForIso).toISOString()).toBe('2030-01-01T00:05:00.000Z');

    global.Math.random.mockRestore();
    jest.useRealTimers();
  });

  test('processRetryQueue vapi_call enqueues into call_queue when journey slot ok', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
    jest.spyOn(global.Math, 'random').mockReturnValue(0);

    const addToCallQueue = jest.fn(async () => {});
    const query = jest.fn(async (sql) => {
      const s = String(sql);
      if (s.includes('UPDATE retry_queue SET scheduled_for')) return { rowCount: 1, rows: [] };
      if (s.includes('SELECT id') && s.includes('FROM call_queue')) return { rows: [] }; // not already queued
      return { rowCount: 0, rows: [] };
    });
    const getPendingRetries = jest.fn(async () => [
      {
        id: 12,
        retry_type: 'vapi_call',
        client_key: 'c1',
        lead_phone: '+15550003333',
        retry_attempt: 0,
        max_retries: 3,
        retry_data: '{"clientConfig":{"x":1}}',
        retry_reason: 'test'
      }
    ]);
    const updateRetryStatus = jest.fn(async () => {});

    jest.unstable_mockModule('../../../db.js', () => ({
      query,
      poolQuerySelect: jest.fn(async () => ({ rows: [] })),
      getFullClient: jest.fn(async () => ({ clientKey: 'c1', timezone: 'UTC', booking: { timezone: 'UTC' } })),
      listFullClients: jest.fn(async () => []),
      addToCallQueue,
      smearCallQueueScheduledFor: jest.fn(async () => {}),
      invalidateClientCache: jest.fn(async () => {}),
      getPendingRetries,
      updateRetryStatus,
      claimOutboundWeekdayJourneySlot: jest.fn(async () => ({ ok: true })),
    }));
    jest.unstable_mockModule('../../../lib/server-queue-workers-shared.js', () => ({
      TIMEZONE: 'UTC',
      isBusinessHours: jest.fn(() => true),
      getNextBusinessHour: jest.fn(() => new Date('2030-01-01T10:00:00.000Z')),
      pickTimezone: jest.fn(() => 'UTC')
    }));

    const { processRetryQueue } = await import('../../../lib/server-queue-workers.js');
    const p = processRetryQueue();
    await jest.advanceTimersByTimeAsync(500);
    await p;

    expect(updateRetryStatus).toHaveBeenCalledWith(12, 'processing');
    expect(addToCallQueue).toHaveBeenCalledWith(
      expect.objectContaining({
        clientKey: 'c1',
        leadPhone: '+15550003333',
        callType: 'vapi_call',
      })
    );
    expect(updateRetryStatus).toHaveBeenCalledWith(12, 'completed');

    global.Math.random.mockRestore();
    jest.useRealTimers();
  });

  test('processRetryQueue cancels retry when weekday journey is terminal', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
    jest.spyOn(global.Math, 'random').mockReturnValue(0);

    const query = jest.fn(async (sql) => {
      if (String(sql).includes("UPDATE retry_queue SET status = 'cancelled'")) return { rowCount: 1 };
      return { rowCount: 0, rows: [] };
    });
    const getPendingRetries = jest.fn(async () => [
      { id: 13, retry_type: 'vapi_call', client_key: 'c1', lead_phone: '+15550004444', retry_attempt: 0, max_retries: 3 }
    ]);
    const updateRetryStatus = jest.fn(async () => {});

    jest.unstable_mockModule('../../../db.js', () => ({
      query,
      poolQuerySelect: jest.fn(async () => ({ rows: [] })),
      getFullClient: jest.fn(async () => ({ clientKey: 'c1', timezone: 'UTC', booking: { timezone: 'UTC' } })),
      listFullClients: jest.fn(async () => []),
      addToCallQueue: jest.fn(async () => {}),
      smearCallQueueScheduledFor: jest.fn(async () => {}),
      invalidateClientCache: jest.fn(async () => {}),
      getPendingRetries,
      updateRetryStatus,
      claimOutboundWeekdayJourneySlot: jest.fn(async () => ({ ok: false, reason: 'journey_terminal' })),
    }));
    jest.unstable_mockModule('../../../lib/server-queue-workers-shared.js', () => ({
      TIMEZONE: 'UTC',
      isBusinessHours: jest.fn(() => true),
      getNextBusinessHour: jest.fn(() => new Date('2030-01-01T10:00:00.000Z')),
      pickTimezone: jest.fn(() => 'UTC')
    }));

    const { processRetryQueue } = await import('../../../lib/server-queue-workers.js');
    const p = processRetryQueue();
    await jest.advanceTimersByTimeAsync(500);
    await p;

    // should not transition to processing/completed for a terminal journey
    expect(updateRetryStatus).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE retry_queue SET status = 'cancelled'"),
      [13]
    );

    global.Math.random.mockRestore();
    jest.useRealTimers();
  });

  test('processRetryQueue resets stale processing retries to pending before fetching pending retries', async () => {
    const query = jest.fn(async (sql) => {
      if (String(sql).includes('WITH stale AS') && String(sql).includes('UPDATE retry_queue rq')) {
        return { rowCount: 2 };
      }
      return { rowCount: 0, rows: [] };
    });
    const getPendingRetries = jest.fn(async () => []);

    jest.unstable_mockModule('../../../db.js', () => ({
      query,
      poolQuerySelect: jest.fn(async () => ({ rows: [] })),
      getFullClient: jest.fn(async () => null),
      listFullClients: jest.fn(async () => []),
      addToCallQueue: jest.fn(async () => {}),
      smearCallQueueScheduledFor: jest.fn(async () => {}),
      invalidateClientCache: jest.fn(async () => {}),
      getPendingRetries,
      updateRetryStatus: jest.fn(async () => {}),
    }));

    const { processRetryQueue } = await import('../../../lib/server-queue-workers.js');
    await processRetryQueue();

    expect(query).toHaveBeenCalledWith(expect.stringContaining('WITH stale AS'));
    expect(getPendingRetries).toHaveBeenCalled();
  });
});
