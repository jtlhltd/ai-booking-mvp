/**
 * Canary for Intent Contract: queue.dedupe-active-call
 *
 * If a Vapi call is already in flight on this instance for a phone, the
 * worker must NOT start a second one for the same number. This prevents
 * duplicate queue rows from racing each other to Vapi while the first call
 * is still active.
 *
 * Asserts:
 *   - markVapiCallActive(callId, { phone }) registers the phone.
 *   - isVapiPhoneActive(phone) returns true.
 *   - callLeadInstantly for that phone returns { ok: false, error: 'phone_already_active' }
 *     and never calls fetch / fetchWithTimeout.
 */
import { describe, expect, test, jest, beforeEach, afterEach } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  process.env.VAPI_PRIVATE_KEY = 'k';
  process.env.VAPI_ASSISTANT_ID = 'asst';
  process.env.VAPI_PHONE_NUMBER_ID = 'ph';
  global.fetch = jest.fn(async () => {
    throw new Error('canary saw an unexpected fetch — dedupe gate must block this dial');
  });
});

afterEach(() => {
  delete process.env.VAPI_PRIVATE_KEY;
  delete process.env.VAPI_ASSISTANT_ID;
  delete process.env.VAPI_PHONE_NUMBER_ID;
});

describe('canary: queue.dedupe-active-call', () => {
  test('callLeadInstantly skips with phone_already_active when phone is in flight', async () => {
    const fetchWithTimeout = jest.fn(async () => {
      throw new Error('canary saw an unexpected fetchWithTimeout — dedupe gate must block this dial');
    });

    jest.unstable_mockModule('../../lib/business-hours.js', () => ({
      isBusinessHoursForTenant: jest.fn(() => true)
    }));
    jest.unstable_mockModule('../../db.js', () => ({
      claimOutboundWeekdayJourneySlot: jest.fn(async () => ({ ok: true })),
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

    const phone = '+447700900444';
    mod.markVapiCallActive('canary_active_cid', { phone, ttlMs: 60_000 });
    expect(mod.isVapiPhoneActive(phone)).toBe(true);

    const result = await mod.callLeadInstantly({
      clientKey: 'tenant-a',
      lead: { phone, name: 'Lead' },
      client: { booking: { timezone: 'Europe/London' }, vapi: {} }
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('phone_already_active');

    expect(fetchWithTimeout).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();

    // Cleanup: release the active marker so subsequent tests are not poisoned.
    mod.releaseVapiSlot({ callId: 'canary_active_cid', reason: 'canary_cleanup' });
    expect(mod.isVapiPhoneActive(phone)).toBe(false);
  });
});
