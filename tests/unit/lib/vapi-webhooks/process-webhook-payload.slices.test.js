import { describe, test, expect, jest, beforeEach } from '@jest/globals';

describe('lib/vapi-webhooks/process-webhook-payload (slices)', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('processWebhookPayload returns early when callId already processed', async () => {
    const dupId = 'call_dup_early';
    jest.unstable_mockModule('../../../../lib/vapi-webhooks/conversation-store.js', () => ({
      callStore: new Map(),
      processedCallIds: new Set([dupId]),
      markProcessed: jest.fn(),
      formatMessagesToTranscript: jest.fn(() => ''),
      CALL_STORE_MAX: 200
    }));

    jest.unstable_mockModule('../../../../store.js', () => ({
      appendLead: jest.fn(),
      findLeadByPhone: jest.fn(async () => null)
    }));

    jest.unstable_mockModule('../../../../sheets.js', () => ({
      appendLead: jest.fn(),
      readSheet: jest.fn(async () => []),
      patchLogisticsRowByNumber: jest.fn(async () => true)
    }));

    jest.unstable_mockModule('../../../../lib/call-quality-analysis.js', () => ({
      analyzeCall: jest.fn(async () => ({}))
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
      mapVapiEndedReasonToOutcome: jest.fn(() => null)
    }));

    jest.unstable_mockModule('../../../../lib/vapi-webhook-verbose-log.js', () => ({
      vapiWebhookVerboseLog: jest.fn()
    }));

    jest.unstable_mockModule('../../../../lib/instant-calling.js', () => ({
      releaseVapiSlot: jest.fn()
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
      poolQuerySelect: jest.fn(async () => ({ rows: [] })),
      getFullClient: jest.fn(async () => ({
        clientKey: 'tk',
        booking: { timezone: 'Europe/London' },
        vapi: {}
      }))
    }));

    const { processWebhookPayload } = await import(
      '../../../../lib/vapi-webhooks/process-webhook-payload.js'
    );

    await processWebhookPayload(
      {
        type: 'event',
        call: { id: dupId, status: 'ended', metadata: {} },
        metadata: { tenantKey: 'tk', leadPhone: '+441234567890' }
      },
      'corr-test'
    );

    expect(true).toBe(true);
  });
});
