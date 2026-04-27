/**
 * Canary for Intent Contract: billing.wallet-check-before-dial
 *
 * When markVapiWalletDepleted() has been called (server.js does this when
 * Vapi recently returned a wallet/credits error), callLeadInstantly must
 * skip the Vapi POST entirely and return { ok: false, error: 'vapi_wallet_depleted' }.
 * The caller (queue worker) then keeps the row pending instead of consuming
 * a Vapi credit just to learn the wallet is still empty.
 */
import { describe, expect, test, jest, beforeEach, afterEach } from '@jest/globals';

const isBusinessHoursForTenant = jest.fn(() => true);
const claimOutboundWeekdayJourneySlot = jest.fn(async () => ({ ok: true }));

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  isBusinessHoursForTenant.mockImplementation(() => true);
  claimOutboundWeekdayJourneySlot.mockResolvedValue({ ok: true });
  process.env.VAPI_PRIVATE_KEY = 'k';
  process.env.VAPI_ASSISTANT_ID = 'asst';
  process.env.VAPI_PHONE_NUMBER_ID = 'ph';
  global.fetch = jest.fn(async () => {
    throw new Error('canary saw an unexpected fetch — wallet gate must skip the dial');
  });
});

afterEach(() => {
  delete process.env.VAPI_PRIVATE_KEY;
  delete process.env.VAPI_ASSISTANT_ID;
  delete process.env.VAPI_PHONE_NUMBER_ID;
});

describe('canary: billing.wallet-check-before-dial', () => {
  test('callLeadInstantly returns vapi_wallet_depleted and skips fetch when flag is set', async () => {
    const fetchWithTimeout = jest.fn(async () => {
      throw new Error('canary saw an unexpected fetchWithTimeout — wallet gate must skip the dial');
    });

    jest.unstable_mockModule('../../lib/business-hours.js', () => ({
      isBusinessHoursForTenant
    }));
    jest.unstable_mockModule('../../db.js', () => ({
      claimOutboundWeekdayJourneySlot,
      rollbackOutboundWeekdayJourneySlot: jest.fn(async () => {}),
      cancelDuplicatePendingCalls: jest.fn(async () => 0),
      inferOutboundAbExperimentNamesForDimensions: jest.fn(async () => ({})),
      inferOutboundAbExperimentName: jest.fn(async () => null),
      upsertCall: jest.fn(async () => {}),
      query: jest.fn(async () => ({ rows: [] }))
    }));
    jest.unstable_mockModule('../../lib/timeouts.js', () => ({
      fetchWithTimeout,
      TIMEOUTS: { vapi: 10000 }
    }));
    jest.unstable_mockModule('../../lib/circuit-breaker.js', () => ({
      withCircuitBreaker: async (_op, fn) => fn()
    }));

    const mod = await import('../../lib/instant-calling.js');

    mod.markVapiWalletDepleted({ ttlMs: 60_000 });
    expect(mod.isVapiWalletDepleted()).toBe(true);

    const result = await mod.callLeadInstantly({
      clientKey: 'tenant-a',
      lead: { phone: '+447700900222', name: 'Lead' },
      client: { booking: { timezone: 'Europe/London' }, vapi: {} }
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('vapi_wallet_depleted');

    expect(fetchWithTimeout).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();

    // Cleanup: don't poison the next test by leaving the flag asserted.
    mod.clearVapiWalletDepleted();
    expect(mod.isVapiWalletDepleted()).toBe(false);
  });
});
