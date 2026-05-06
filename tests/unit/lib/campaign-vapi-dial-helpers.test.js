import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';

describe('lib/campaign-vapi-dial-helpers', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('runLogisticsOutreach throws without vapi key', async () => {
    const { runLogisticsOutreach } = await import('../../../lib/campaign-vapi-dial-helpers.js');
    await expect(
      runLogisticsOutreach({ assistantId: 'a', businesses: [], tenantKey: 't', vapiKey: '' })
    ).rejects.toThrow(/not configured/);
  });

  test('runLogisticsOutreach batches mocked Vapi calls', async () => {
    jest.unstable_mockModule('../../../lib/vapi.js', () => ({
      createCallWithKey: jest.fn(async ({ callData }) => ({
        id: `call_${callData.customer.number}`
      }))
    }));
    const { runLogisticsOutreach } = await import('../../../lib/campaign-vapi-dial-helpers.js');
    const run = runLogisticsOutreach({
      assistantId: 'asst',
      tenantKey: 'tenant',
      vapiKey: 'secret',
      businesses: [{ name: 'Acme', phone: '+441234567890', address: 'Leeds' }]
    });
    await jest.advanceTimersByTimeAsync(50);
    const results = await run;
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('call_initiated');
    expect(results[0].callId).toBeDefined();
  });

  test('startColdCallCampaign returns empty when vapiKey missing', async () => {
    const { startColdCallCampaign } = await import('../../../lib/campaign-vapi-dial-helpers.js');
    const out = await startColdCallCampaign({ id: 'c1', businesses: [] });
    expect(out).toEqual([]);
  });
});
