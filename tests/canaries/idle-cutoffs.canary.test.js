/**
 * Canary for Intent Contract: billing.idle-call-cutoffs
 *
 * Every outbound Vapi payload built by lib/instant-calling.js must include
 * the four idle-call cutoff fields under assistantOverrides:
 *   - maxDurationSeconds
 *   - silenceTimeoutSeconds
 *   - endCallOnSilence
 *   - voicemailDetection (with .enabled === true)
 *
 * These cap the worst-case spend on a single call. Without them, voicemail
 * boxes, dead air, and stuck assistants can burn credits unboundedly.
 */
import { describe, expect, test, jest, beforeEach, afterEach } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  process.env.VAPI_PRIVATE_KEY = 'k';
  process.env.VAPI_ASSISTANT_ID = 'asst';
  process.env.VAPI_PHONE_NUMBER_ID = 'ph';
  global.fetch = jest.fn(async () => {
    throw new Error('canary saw an unexpected fetch — should go through fetchWithTimeout mock');
  });
});

afterEach(() => {
  delete process.env.VAPI_PRIVATE_KEY;
  delete process.env.VAPI_ASSISTANT_ID;
  delete process.env.VAPI_PHONE_NUMBER_ID;
});

describe('canary: billing.idle-call-cutoffs', () => {
  test('callLeadInstantly Vapi payload includes the four idle-call cutoffs', async () => {
    const captured = { body: null };
    const fetchWithTimeout = jest.fn(async (_url, init) => {
      try {
        captured.body = JSON.parse(init.body);
      } catch {
        captured.body = init?.body;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: 'cid_idle_canary', status: 'queued' })
      };
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
    jest.unstable_mockModule('../../lib/realtime-events.js', () => ({
      emitCallStarted: jest.fn()
    }));

    const mod = await import('../../lib/instant-calling.js');

    const result = await mod.callLeadInstantly({
      clientKey: 'tenant-a',
      lead: { phone: '+447700900333', name: 'Lead', service: 'demo' },
      client: { booking: { timezone: 'Europe/London' }, vapi: {} }
    });

    expect(result.ok).toBe(true);
    expect(fetchWithTimeout).toHaveBeenCalledTimes(1);

    const body = captured.body;
    expect(body).toBeTruthy();
    expect(body.assistantOverrides).toBeTruthy();

    const ov = body.assistantOverrides;
    expect(typeof ov.maxDurationSeconds).toBe('number');
    expect(ov.maxDurationSeconds).toBeGreaterThan(0);
    expect(ov.maxDurationSeconds).toBeLessThanOrEqual(60 * 60);

    expect(typeof ov.silenceTimeoutSeconds).toBe('number');
    expect(ov.silenceTimeoutSeconds).toBeGreaterThan(0);
    expect(ov.silenceTimeoutSeconds).toBeLessThanOrEqual(120);

    expect(ov.endCallOnSilence).toBe(true);

    expect(ov.voicemailDetection).toBeTruthy();
    expect(ov.voicemailDetection.enabled).toBe(true);

    mod.releaseVapiSlot({ callId: 'cid_idle_canary', reason: 'canary_cleanup' });
  });
});
