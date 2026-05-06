import { describe, test, expect, jest, beforeEach } from '@jest/globals';

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
});
