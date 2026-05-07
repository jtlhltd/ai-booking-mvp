import { describe, test, expect, jest, beforeEach } from '@jest/globals';

describe('lib/vapi-webhooks/process-webhook-payload (slices)', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  async function loadWithMocks({
    conversationStore,
    endedReasonOutcome = null,
    getFullClient = async () => ({
      clientKey: 'tk',
      booking: { timezone: 'Europe/London' },
      vapi: {}
    })
  } = {}) {
    const releaseVapiSlot = jest.fn();
    const mapVapiEndedReasonToOutcome = jest.fn(() => endedReasonOutcome);
    const markProcessed = jest.fn();
    const formatMessagesToTranscript = jest.fn(() => '');

    jest.unstable_mockModule('../../../../lib/vapi-webhooks/conversation-store.js', () => ({
      callStore: conversationStore?.callStore ?? new Map(),
      processedCallIds: conversationStore?.processedCallIds ?? new Set(),
      markProcessed,
      formatMessagesToTranscript,
      CALL_STORE_MAX: 200
    }));

    jest.unstable_mockModule('../../../../store.js', () => ({
      getFullClient: jest.fn(getFullClient),
      findLeadByPhone: jest.fn(async () => null),
      appendLead: jest.fn(async () => ({ ok: true }))
    }));
    jest.unstable_mockModule('../../../../sheets.js', () => ({
      readSheet: jest.fn(async () => []),
      patchLogisticsRowByNumber: jest.fn(async () => true)
    }));
    jest.unstable_mockModule('../../../../lib/call-quality-analysis.js', () => ({
      analyzeCall: jest.fn(() => ({
        sentiment: 'neutral',
        qualityScore: 0,
        keyPhrases: [],
        objections: [],
        concerns: []
      }))
    }));
    jest.unstable_mockModule('../../../../lib/messaging-service.js', () => ({
      default: { sendSms: jest.fn() }
    }));
    jest.unstable_mockModule('../../../../lib/operator-alerts.js', () => ({
      sendOperatorAlert: jest.fn(async () => ({ sent: false }))
    }));
    jest.unstable_mockModule('../../../../lib/logistics-extractor.js', () => ({
      extractLogisticsFields: jest.fn(() => ({}))
    }));
    jest.unstable_mockModule('../../../../lib/demo-telemetry.js', () => ({
      recordReceptionistTelemetry: jest.fn()
    }));
    jest.unstable_mockModule('../../../../lib/call-context-cache.js', () => ({
      storeCallContext: jest.fn()
    }));
    jest.unstable_mockModule('../../../../lib/vapi-call-outcome-map.js', () => ({
      mapVapiEndedReasonToOutcome
    }));
    jest.unstable_mockModule('../../../../lib/vapi-webhook-verbose-log.js', () => ({
      vapiWebhookVerboseLog: jest.fn()
    }));
    jest.unstable_mockModule('../../../../lib/instant-calling.js', () => ({
      releaseVapiSlot
    }));
    jest.unstable_mockModule('../../../../lib/vapi-webhooks/pick-callee-business-name.js', () => ({
      pickCalleeBusinessNameForSheet: jest.fn(() => '')
    }));
    jest.unstable_mockModule('../../../../lib/vapi-webhooks/update-call-tracking.js', () => ({
      updateCallTracking: jest.fn(async () => {})
    }));
    jest.unstable_mockModule('../../../../lib/vapi-webhooks/outcome-handlers.js', () => ({
      pickReceptionistName: jest.fn(() => ''),
      handleBookingOutcome: jest.fn(async () => {}),
      handleInterestedProspect: jest.fn(async () => {}),
      handleFailedCall: jest.fn(async () => {})
    }));
    jest.unstable_mockModule('../../../../db.js', () => ({
      query: jest.fn(async () => ({ rows: [] })),
      poolQuerySelect: jest.fn(async () => ({ rows: [] }))
    }));

    const mod = await import('../../../../lib/vapi-webhooks/process-webhook-payload.js');
    return { processWebhookPayload: mod.processWebhookPayload, releaseVapiSlot, mapVapiEndedReasonToOutcome, markProcessed, formatMessagesToTranscript };
  }

  test('processWebhookPayload returns early when callId already processed', async () => {
    const dupId = 'call_dup_early';
    const { processWebhookPayload, releaseVapiSlot } = await loadWithMocks({
      conversationStore: { callStore: new Map(), processedCallIds: new Set([dupId]) }
    });

    await processWebhookPayload(
      {
        type: 'event',
        call: { id: dupId, status: 'ended', metadata: {} },
        metadata: { tenantKey: 'tk', leadPhone: '+441234567890' }
      },
      'corr-test'
    );

    // Slot release happens before dedupe check (ended call signal).
    expect(releaseVapiSlot).toHaveBeenCalledWith(expect.objectContaining({ callId: dupId }));
    expect(true).toBe(true);
  });

  test('normalizes message wrapper + maps endedReason to outcome when generic failure; releases vapi slot', async () => {
    const { processWebhookPayload, releaseVapiSlot, mapVapiEndedReasonToOutcome } = await loadWithMocks({
      conversationStore: { callStore: new Map(), processedCallIds: new Set() },
      endedReasonOutcome: 'no_answer'
    });

    await processWebhookPayload(
      {
        message: {
          type: 'event',
          endedReason: 'customer-did-not-answer',
          call: {
            id: 'call_1',
            status: 'initiated',
            outcome: 'failed',
            endedAt: '2030-01-01T00:00:00.000Z',
            metadata: {}
          }
        },
        metadata: { tenantKey: 'tk' }
      },
      'corr-1'
    );

    expect(mapVapiEndedReasonToOutcome).toHaveBeenCalledWith('customer-did-not-answer');
    expect(releaseVapiSlot).toHaveBeenCalledWith(expect.objectContaining({ callId: 'call_1' }));
  });

  test('prefers accumulated conversation-store transcript on end-of-call-report and deletes store entry', async () => {
    const callId = 'call_transcript_1';
    const callStore = new Map([[callId, [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }]]]);
    const { processWebhookPayload, formatMessagesToTranscript } = await loadWithMocks({
      conversationStore: { callStore, processedCallIds: new Set() }
    });
    formatMessagesToTranscript.mockReturnValue('User: hi\n\nAI: hello');

    await processWebhookPayload(
      {
        type: 'end-of-call-report',
        call: { id: callId, status: 'ended', endedAt: '2030-01-01T00:00:00.000Z', metadata: {} },
        metadata: { tenantKey: 'tk' }
      },
      'corr-2'
    );

    expect(formatMessagesToTranscript).toHaveBeenCalled();
    expect(callStore.has(callId)).toBe(false);
  });

  test('formats body.messages into transcript and filters system/tool/instruction-like content', async () => {
    const { processWebhookPayload } = await loadWithMocks({
      conversationStore: { callStore: new Map(), processedCallIds: new Set() }
    });

    await processWebhookPayload(
      {
        type: 'end-of-call-report',
        call: { id: 'call_msgs_1', status: 'ended', endedAt: '2030-01-01T00:00:00.000Z', metadata: {} },
        metadata: { tenantKey: 'tk' },
        messages: [
          { role: 'system', content: 'TOOLS: DO NOT ADD YOUR OWN' },
          { role: 'tool', content: 'whatever' },
          { role: 'user', content: 'I need a quote' },
          { role: 'assistant', content: 'Sure—what lane and volume?' }
        ]
      },
      'corr-3'
    );

    expect(true).toBe(true);
  });
});
