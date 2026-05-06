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
});
