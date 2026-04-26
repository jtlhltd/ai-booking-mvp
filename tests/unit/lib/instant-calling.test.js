import { describe, expect, test, jest, beforeEach, afterEach } from '@jest/globals';

const isBusinessHoursForTenant = jest.fn(() => true);
const claimOutboundWeekdayJourneySlot = jest.fn(async () => ({ ok: true }));
const rollbackOutboundWeekdayJourneySlot = jest.fn(async () => {});
const cancelDuplicatePendingCalls = jest.fn(async () => 0);
const inferOutboundAbExperimentNamesForDimensions = jest.fn(async () => ({}));
const inferOutboundAbExperimentName = jest.fn(async () => null);
const upsertCall = jest.fn(async () => {});

jest.unstable_mockModule('../../../lib/business-hours.js', () => ({
  isBusinessHoursForTenant
}));

jest.unstable_mockModule('../../../db.js', () => ({
  claimOutboundWeekdayJourneySlot,
  rollbackOutboundWeekdayJourneySlot,
  cancelDuplicatePendingCalls,
  inferOutboundAbExperimentNamesForDimensions,
  inferOutboundAbExperimentName,
  upsertCall,
  query: jest.fn(async () => ({ rows: [] }))
}));

jest.unstable_mockModule('../../../lib/circuit-breaker.js', () => ({
  withCircuitBreaker: async (_op, fn, _fb) => fn()
}));

const fetchWithTimeout = jest.fn();
jest.unstable_mockModule('../../../lib/timeouts.js', () => ({
  fetchWithTimeout,
  TIMEOUTS: { vapi: 10000 }
}));

const selectABTestVariantForLead = jest.fn(async () => null);
jest.unstable_mockModule('../../../lib/outbound-ab-variant.js', () => ({
  selectABTestVariantForLead,
  buildAssistantOverridesFromVariantConfig: () => ({ overrides: {} }),
  mergeAssistantOverrides: (a, b) => ({ ...(a || {}), ...(b || {}) })
}));

jest.unstable_mockModule('../../../lib/outbound-ab-focus.js', () => ({
  resolveOutboundAbDimensionsForDial: () => []
}));

jest.unstable_mockModule('../../../lib/messaging-service.js', () => ({
  default: { sendSMS: jest.fn(async () => ({})) }
}));

jest.unstable_mockModule('../../../lib/realtime-events.js', () => ({
  emitCallStarted: jest.fn()
}));

describe('instant-calling', () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    isBusinessHoursForTenant.mockImplementation(() => true);
    claimOutboundWeekdayJourneySlot.mockResolvedValue({ ok: true });
    fetchWithTimeout.mockReset();
    process.env.VAPI_PRIVATE_KEY = 'k';
    process.env.VAPI_ASSISTANT_ID = 'asst';
    process.env.VAPI_PHONE_NUMBER_ID = 'ph';
    process.env.VAPI_MAX_CONCURRENT = '1';
    process.env.VAPI_SLOT_WAIT_MS = '5000';
    delete process.env.VAPI_CONCURRENCY_RELEASE_UNKNOWN;
  });

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  test('estimateCallTime formats totals', async () => {
    const { estimateCallTime } = await import('../../../lib/instant-calling.js');
    const r = estimateCallTime(3, 2000);
    expect(r.totalSeconds).toBe(6);
    expect(r.formatted).toMatch(/6s/);
    expect(typeof r.completionTime).toBe('string');
  });

  test('callLeadInstantly returns vapi_not_configured when env keys missing', async () => {
    delete process.env.VAPI_PRIVATE_KEY;
    const { callLeadInstantly } = await import('../../../lib/instant-calling.js');
    const r = await callLeadInstantly({
      clientKey: 'c1',
      lead: { phone: '+447700900001' },
      client: { booking: { timezone: 'Europe/London' }, vapi: {} }
    });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('vapi_not_configured');
  });

  test('callLeadInstantly skips outside business hours unless allowOutsideBusinessHours', async () => {
    isBusinessHoursForTenant.mockReturnValue(false);
    const { callLeadInstantly } = await import('../../../lib/instant-calling.js');
    const r = await callLeadInstantly({
      clientKey: 'c1',
      lead: { phone: '+447700900001' },
      client: { booking: { timezone: 'Europe/London' } }
    });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('outside_business_hours');

    isBusinessHoursForTenant.mockReturnValue(true);
    const modHours = await import('../../../lib/instant-calling.js');
    fetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: 'cid1', status: 'queued' })
    });
    const ok = await modHours.callLeadInstantly({
      clientKey: 'c1',
      lead: { phone: '+447700900001' },
      client: { booking: { timezone: 'Europe/London' }, vapi: {} },
      allowOutsideBusinessHours: true
    });
    expect(ok.ok).toBe(true);
    modHours.releaseVapiSlot({ callId: 'cid1', reason: 'test' });
  });

  test('callLeadInstantly rejects empty phone', async () => {
    const { callLeadInstantly } = await import('../../../lib/instant-calling.js');
    const r = await callLeadInstantly({
      clientKey: 'c1',
      lead: { phone: '   ' },
      client: { booking: { timezone: 'Europe/London' }, vapi: {} }
    });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('lead_phone_missing');
  });

  test('callLeadInstantly maps journey_terminal and not_weekday and daily_dial_limit', async () => {
    const { callLeadInstantly } = await import('../../../lib/instant-calling.js');

    claimOutboundWeekdayJourneySlot.mockResolvedValueOnce({
      ok: false,
      reason: 'journey_terminal',
      closedReason: 'answered'
    });
    let r = await callLeadInstantly({
      clientKey: 'c1',
      lead: { phone: '+447700900002' },
      client: { booking: { timezone: 'Europe/London' }, vapi: {} }
    });
    expect(r.error).toBe('outbound_journey_complete');

    claimOutboundWeekdayJourneySlot.mockResolvedValueOnce({ ok: false, reason: 'not_weekday' });
    r = await callLeadInstantly({
      clientKey: 'c1',
      lead: { phone: '+447700900002' },
      client: { booking: { timezone: 'Europe/London' }, vapi: {} }
    });
    expect(r.error).toBe('outside_business_hours');

    claimOutboundWeekdayJourneySlot.mockResolvedValueOnce({ ok: false, reason: 'slot_taken' });
    r = await callLeadInstantly({
      clientKey: 'c1',
      lead: { phone: '+447700900002' },
      client: { booking: { timezone: 'Europe/London' }, vapi: {} }
    });
    expect(r.error).toBe('daily_dial_limit');
  });

  test('callLeadInstantly invokes cancelDuplicatePendingCalls when callQueueId is valid', async () => {
    fetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: 'cq1', status: 'queued' })
    });
    const modQ = await import('../../../lib/instant-calling.js');
    await modQ.callLeadInstantly({
      clientKey: 'c1',
      callQueueId: 42,
      lead: { phone: '+447700900003' },
      client: { booking: { timezone: 'Europe/London' }, vapi: {} }
    });
    expect(cancelDuplicatePendingCalls).toHaveBeenCalledWith('c1', '+447700900003', 42);
    modQ.releaseVapiSlot({ callId: 'cq1', reason: 'test' });
  });

  test('callLeadInstantly returns vapi_client_error on 4xx', async () => {
    fetchWithTimeout.mockResolvedValueOnce({
      ok: false,
      status: 422,
      text: async () => 'bad'
    });
    const { callLeadInstantly } = await import('../../../lib/instant-calling.js');
    const r = await callLeadInstantly({
      clientKey: 'c1',
      lead: { phone: '+447700900004' },
      client: { booking: { timezone: 'Europe/London' }, vapi: {} }
    });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('vapi_client_error');
    expect(rollbackOutboundWeekdayJourneySlot).toHaveBeenCalled();
  });

  test('callLeadInstantly success path persists call and metadata', async () => {
    fetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: 'vapi_ok_1', status: 'queued' })
    });
    const modSucc = await import('../../../lib/instant-calling.js');
    const r = await modSucc.callLeadInstantly({
      clientKey: 'c1',
      lead: { phone: '+447700900005', name: 'Acme', service: 'x', source: 'y', leadScore: 88 },
      client: {
        booking: { timezone: 'Europe/London' },
        displayName: 'Tenant',
        industry: 'plumbing',
        vapi: {}
      }
    });
    expect(r.ok).toBe(true);
    expect(r.callId).toBe('vapi_ok_1');
    expect(upsertCall).toHaveBeenCalled();
    modSucc.releaseVapiSlot({ callId: 'vapi_ok_1', reason: 'test' });
  });

  test('releaseVapiSlot can force-release unknown callId when env flag set', async () => {
    process.env.VAPI_CONCURRENCY_RELEASE_UNKNOWN = '1';
    const { acquireVapiSlot, releaseVapiSlot, getVapiConcurrencyState } = await import(
      '../../../lib/instant-calling.js'
    );
    await acquireVapiSlot({});
    expect(getVapiConcurrencyState().current).toBe(1);
    releaseVapiSlot({ callId: 'never-seen', reason: 'ended' });
    expect(getVapiConcurrencyState().current).toBe(0);
  });

  test('acquireVapiSlot throws when signal already aborted', async () => {
    const ac = new AbortController();
    ac.abort();
    const { acquireVapiSlot } = await import('../../../lib/instant-calling.js');
    await expect(acquireVapiSlot({ signal: ac.signal })).rejects.toMatchObject({ code: 'queue_handler_aborted' });
  });

  test('acquireVapiSlot rejects when aborted while queued', async () => {
    const mod = await import('../../../lib/instant-calling.js');
    await mod.acquireVapiSlot({});
    const ac = new AbortController();
    const p2 = mod.acquireVapiSlot({ signal: ac.signal });
    queueMicrotask(() => ac.abort());
    await expect(p2).rejects.toMatchObject({ code: 'queue_handler_aborted' });
    mod.releaseVapiSlot({ reason: 'cleanup' });
  });

  test('processCallQueue tallies failures when Vapi not configured', async () => {
    delete process.env.VAPI_PRIVATE_KEY;
    const { processCallQueue } = await import('../../../lib/instant-calling.js');
    const r = await processCallQueue(
      [{ phone: '+1' }, { phone: '+2' }],
      { client_key: 'ck' },
      { delayBetweenCalls: 0, maxCallsPerBatch: 10 }
    );
    expect(r.total).toBe(2);
    expect(r.failed).toBe(2);
    expect(r.initiated).toBe(0);
  });
});
