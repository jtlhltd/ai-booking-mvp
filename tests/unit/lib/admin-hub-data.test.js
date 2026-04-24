import { describe, expect, test, jest, beforeEach } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
});

describe('admin-hub-data', () => {
  test('getBusinessStats aggregates enabled clients and tolerates per-client errors', async () => {
    const query = jest.fn(async () => ({ rows: [{ count: '2' }] }));
    const listClientSummaries = jest.fn(async () => [
      { clientKey: 'c1', isEnabled: true },
      { clientKey: 'c2', isEnabled: false },
      { clientKey: 'c3', isEnabled: true }
    ]);
    const getCallsByTenant = jest.fn(async (clientKey) => {
      if (clientKey === 'c3') throw new Error('boom');
      return [{ id: 1 }, { id: 2 }];
    });
    const getLeadsByClient = jest.fn(async () => []);

    jest.unstable_mockModule('../../../db.js', () => ({
      query,
      listClientSummaries,
      getLeadsByClient,
      getCallsByTenant
    }));

    const { getBusinessStats } = await import('../../../lib/admin-hub-data.js');
    const out = await getBusinessStats();
    expect(out).toEqual(
      expect.objectContaining({
        activeClients: 2,
        monthlyRevenue: 1000
      })
    );
    expect(listClientSummaries).toHaveBeenCalled();
  });
});

