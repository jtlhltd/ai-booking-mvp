/**
 * Canary for Intent Contract: dial.lead-dial-context-contained
 *
 * The dial payload must apply sanitized per-lead context as the final shallow
 * variableValues overlay: sequence-owned reserved keys survive, while safe
 * custom lead keys override earlier values.
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

describe('canary: dial.lead-dial-context-contained', () => {
  test('callLeadInstantly overlays only safe lead variableValues after sequence merges', async () => {
    const captured = { body: null };
    const fetchWithTimeout = jest.fn(async (_url, init) => {
      captured.body = JSON.parse(init.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: 'cid_lead_ctx_canary', status: 'queued' })
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
      getLeadSequenceState: jest.fn(async () => ({
        attemptsTotal: 1,
        stagesCompleted: []
      })),
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
    jest.unstable_mockModule('../../lib/outbound-ab-variant.js', () => ({
      selectABTestVariantForLead: jest.fn(async () => null),
      buildAssistantOverridesFromVariantConfig: () => ({ overrides: {} }),
      mergeAssistantOverrides: (a, b) => ({
        ...(a || {}),
        ...(b || {}),
        variableValues: {
          ...((a && typeof a.variableValues === 'object') ? a.variableValues : {}),
          ...((b && typeof b.variableValues === 'object') ? b.variableValues : {})
        }
      })
    }));
    jest.unstable_mockModule('../../lib/outbound-ab-focus.js', () => ({
      resolveOutboundAbDimensionsForDial: () => []
    }));
    jest.unstable_mockModule('../../lib/outbound-sequence.js', () => ({
      getValidatedOutboundSequence: jest.fn(() => ({ enabled: true })),
      getStageById: jest.fn(() => ({ id: 'stage-1', isFinal: false })),
      buildAssistantOverridesForStage: jest.fn(() => ({
        variableValues: {
          lane: 'from_sequence',
          leadName: 'Sequence Name',
          seqOnly: 'kept'
        }
      })),
      isOutboundSequenceGloballyDisabled: jest.fn(() => false)
    }));

    const mod = await import('../../lib/instant-calling.js');
    const result = await mod.callLeadInstantly({
      clientKey: 'tenant-a',
      lead: { phone: '+447700900444', name: 'Lead', service: 'demo' },
      leadDialContext: {
        lane: 'from_lead',
        safeBoolean: true,
        nested: { nope: true },
        leadName: 'Bad Override',
        tenant_key: 'd2d-xpress-tom'
      },
      client: {
        booking: { timezone: 'Europe/London' },
        assistantOverrides: { variableValues: { baseOnly: 'base' } },
        outboundSequence: { enabled: true },
        vapi: {}
      },
      queueCallData: { stageId: 'stage-1' }
    });

    expect(result.ok).toBe(true);
    expect(fetchWithTimeout).toHaveBeenCalledTimes(1);
    expect(global.fetch).not.toHaveBeenCalled();

    const vars = captured.body?.assistantOverrides?.variableValues;
    expect(vars).toEqual({
      baseOnly: 'base',
      lane: 'from_lead',
      leadName: 'Sequence Name',
      seqOnly: 'kept',
      safeBoolean: true
    });
    expect(vars.nested).toBeUndefined();
    expect(vars.tenant_key).toBeUndefined();

    mod.releaseVapiSlot({ callId: 'cid_lead_ctx_canary', reason: 'canary_cleanup' });
  });
});
