/**
 * Boundary tests for routes/vapi-webhooks.js targeting uncovered branch ranges
 * called out in the test-suite-overhaul plan: ~918-1008, 1414-1501, 1515-1549,
 * 1574-1627, 1803-1915.
 *
 * These tests deliberately stay shallow: they wire up the deps the route imports,
 * fire well-formed VAPI payloads, and assert the side effects that prove the
 * targeted branch fired (mock invocation, response shape, 200 OK).
 */
import { describe, expect, test, jest, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';

import { createContractApp } from '../helpers/contract-harness.js';

const query = jest.fn(async () => ({ rows: [] }));

jest.unstable_mockModule('../../middleware/vapi-webhook-verification.js', () => ({
  verifyVapiSignature: (_req, _res, next) => next()
}));

jest.unstable_mockModule('../../db.js', () => ({
  dbType: 'postgres',
  query,
  upsertCall: jest.fn(async () => {}),
  trackCost: jest.fn(async () => {}),
  recordOutboundAbLivePickups: jest.fn(async () => {}),
  closeOutboundWeekdayJourneyOnLivePickup: jest.fn(async () => {}),
  recordCallTimeBanditAfterCallComplete: jest.fn(async () => {}),
  recordABTestOutcome: jest.fn(async () => {})
}));

const sendEmail = jest.fn(async () => ({ ok: true }));
jest.unstable_mockModule('../../lib/messaging-service.js', () => ({
  default: { sendEmail }
}));

const updateLogisticsRowByPhone = jest.fn(async () => false);
const appendLogistics = jest.fn(async () => {});
jest.unstable_mockModule('../../sheets.js', () => ({
  updateLogisticsRowByPhone,
  appendLogistics
}));

const sendOperatorAlert = jest.fn(async () => ({ sent: true }));
jest.unstable_mockModule('../../lib/operator-alerts.js', () => ({ sendOperatorAlert }));

jest.unstable_mockModule('../../lib/call-quality-analysis.js', () => ({
  analyzeCall: () => ({ sentiment: 'neutral', qualityScore: 0, objections: [], keyPhrases: [], analyzedAt: new Date().toISOString() })
}));
jest.unstable_mockModule('../../lib/logistics-extractor.js', () => ({
  extractLogisticsFields: () => ({
    email: 'a@b',
    international: 'N',
    mainCouriers: ['DPD'],
    frequency: '5/wk',
    mainCountries: ['UK'],
    callbackNeeded: 'TRUE'
  })
}));
jest.unstable_mockModule('../../lib/demo-telemetry.js', () => ({
  recordReceptionistTelemetry: jest.fn(async () => {}),
  recordDemoTelemetry: jest.fn(async () => {})
}));
jest.unstable_mockModule('../../lib/call-context-cache.js', () => ({ storeCallContext: jest.fn(() => {}) }));
const mapVapiEndedReasonToOutcome = jest.fn(() => 'no-answer');
jest.unstable_mockModule('../../lib/vapi-call-outcome-map.js', () => ({ mapVapiEndedReasonToOutcome }));
jest.unstable_mockModule('../../lib/vapi-webhook-verbose-log.js', () => ({ vapiWebhookVerboseLog: () => {} }));
jest.unstable_mockModule('../../lib/vapi-function-handlers.js', () => ({
  handleVapiFunctionCall: jest.fn(async () => ({ success: true, data: { ok: true } }))
}));
jest.unstable_mockModule('../../lib/follow-up-sequences.js', () => ({
  scheduleFollowUps: jest.fn(async () => ({ ok: true }))
}));
jest.unstable_mockModule('../../lib/outbound-ab-live-pickup.js', () => ({
  collectOutboundAbExperimentNamesFromMetadata: () => []
}));
jest.unstable_mockModule('../../store.js', () => ({
  getFullClient: jest.fn(async () => ({
    clientKey: 'c1',
    vapi: { logisticsSheetId: 'sheet_123', callbackInboxEmail: 'inbox@tenant' },
    gsheet_id: 'sheet_123'
  }))
}));

beforeEach(() => {
  query.mockReset().mockImplementation(async (sql) => {
    const s = String(sql);
    if (s.includes('INSERT INTO webhook_events')) return { rows: [{ id: 1 }] };
    if (s.includes('SET processed_at = NOW()')) return { rows: [] };
    if (s.includes('SET processing_started_at')) return { rows: [{ id: 1 }] };
    return { rows: [] };
  });
  sendEmail.mockClear();
  appendLogistics.mockClear();
  updateLogisticsRowByPhone.mockReset().mockResolvedValue(false);
  sendOperatorAlert.mockClear();
  mapVapiEndedReasonToOutcome.mockReset().mockReturnValue('completed');
});

const LONG_TRANSCRIPT_OK = 'User: Hello there, this is the receptionist speaking and we are happy to share details about our shipping needs today.';
const CALLBACK_TRANSCRIPT = 'User: Please call back tomorrow morning, the manager is not available right now and we will need to try again later.';

afterEach(() => {
  delete process.env.DISABLE_CALLBACK_INBOX_EMAILS;
  delete process.env.LOGISTICS_SHEET_ID;
  delete process.env.CALLBACK_INBOX_EMAIL;
});

async function flushAsync() {
  for (let i = 0; i < 4; i++) {
    await new Promise((r) => setImmediate(r));
  }
}

describe('Vapi webhook boundary cases (lines ~918-1008)', () => {
  test('tool-call access_google_sheet with stringified args is parsed but does NOT append (skip-on-function-call rule)', async () => {
    const { default: router } = await import('../../routes/vapi-webhooks.js');
    const app = createContractApp({ mounts: [{ path: '/', router }] });

    const res = await request(app)
      .post('/webhooks/vapi')
      .send({
        message: { type: 'function-call', call: { id: 'call_a' } },
        toolCalls: [
          {
            function: {
              name: 'access_google_sheet',
              arguments: JSON.stringify({ action: 'append', data: { foo: 'bar' } })
            }
          }
        ],
        metadata: { tenantKey: 'c1', correlationId: 'a-1', leadPhone: '+44' }
      })
      .expect(200);
    expect(res.body).toEqual(expect.objectContaining({ ok: true }));
    await flushAsync();
    // Skip-on-function-call: appendLogistics must not be called via the tool path
    expect(appendLogistics).not.toHaveBeenCalled();
  });

  test('tool-call schedule_callback with object args triggers email when callbackInboxEmail configured', async () => {
    const { default: router } = await import('../../routes/vapi-webhooks.js');
    const app = createContractApp({ mounts: [{ path: '/', router }] });

    await request(app)
      .post('/webhooks/vapi')
      .send({
        message: { type: 'function-call', call: { id: 'call_b' } },
        toolCalls: [
          {
            function: {
              name: 'schedule_callback',
              // Route's outer parser does JSON.parse(arguments || '{}') first, so a JSON string
              // is required. The inner schedule_callback handler also accepts both shapes.
              arguments: JSON.stringify({
                businessName: 'Tom Co',
                phone: '+447700900000',
                receptionistName: 'Sara',
                reason: 'callback',
                preferredTime: 'tomorrow',
                notes: 'urgent'
              })
            }
          }
        ],
        metadata: { tenantKey: 'c1', correlationId: 'b-1' }
      })
      .expect(200);
    await flushAsync();
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'inbox@tenant', subject: expect.stringContaining('Callback Scheduled') })
    );
  });

  test('tool-call with malformed string args does not crash (error caught, 200 returned)', async () => {
    const { default: router } = await import('../../routes/vapi-webhooks.js');
    const app = createContractApp({ mounts: [{ path: '/', router }] });

    const res = await request(app)
      .post('/webhooks/vapi')
      .send({
        message: { type: 'function-call', call: { id: 'call_c' } },
        toolCalls: [{ function: { name: 'access_google_sheet', arguments: '{not-json' } }],
        metadata: { tenantKey: 'c1', correlationId: 'c-1' }
      })
      .expect(200);
    expect(res.body.ok).toBe(true);
  });
});

describe('Vapi webhook end-of-call-report logistics path (lines ~1414-1549)', () => {
  test('end-of-call-report appends new sheet row when no existing row found', async () => {
    updateLogisticsRowByPhone.mockResolvedValue(false);
    const { default: router } = await import('../../routes/vapi-webhooks.js');
    const app = createContractApp({ mounts: [{ path: '/', router }] });

    await request(app)
      .post('/webhooks/vapi')
      .send({
        type: 'end-of-call-report',
        call: {
          id: 'call_eocr_app',
          assistantId: 'b19a474b-49f3-474d-adb2-4aacc6ad37e7',
          status: 'ended',
          endedReason: 'customer-ended-call',
          duration: 30,
          recordingUrl: 'https://r/1',
          artifact: { transcript: LONG_TRANSCRIPT_OK, structuredOutputs: [{ result: { Email: 'a@b' } }] }
        },
        message: { type: 'end-of-call-report', call: { id: 'call_eocr_app' } },
        metadata: { tenantKey: 'c1', correlationId: 'eocr-app', leadPhone: '+447700900000' }
      })
      .expect(200);

    await flushAsync();
    expect(updateLogisticsRowByPhone).toHaveBeenCalled();
    expect(appendLogistics).toHaveBeenCalledWith('sheet_123', expect.any(Object));
  });

  test('end-of-call-report sends callback inbox email when callbackNeeded=TRUE and inbox configured', async () => {
    updateLogisticsRowByPhone.mockResolvedValue(true);
    const { default: router } = await import('../../routes/vapi-webhooks.js');
    const app = createContractApp({ mounts: [{ path: '/', router }] });

    await request(app)
      .post('/webhooks/vapi')
      .send({
        type: 'end-of-call-report',
        transcript: CALLBACK_TRANSCRIPT,
        call: {
          id: 'call_eocr_cb',
          assistantId: 'b19a474b-49f3-474d-adb2-4aacc6ad37e7',
          status: 'ended',
          endedReason: 'customer-ended-call',
          duration: 30,
          recordingUrl: 'https://r/2',
          artifact: { transcript: CALLBACK_TRANSCRIPT, structuredOutputs: [] }
        },
        message: { type: 'end-of-call-report', call: { id: 'call_eocr_cb' } },
        metadata: { tenantKey: 'c1', correlationId: 'eocr-cb', leadPhone: '+447700900000' }
      })
      .expect(200);
    await flushAsync();
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'inbox@tenant', subject: expect.stringMatching(/Callback needed/i) })
    );
  });

  test('callback inbox email is suppressed when DISABLE_CALLBACK_INBOX_EMAILS=true', async () => {
    process.env.DISABLE_CALLBACK_INBOX_EMAILS = 'true';
    updateLogisticsRowByPhone.mockResolvedValue(true);
    const { default: router } = await import('../../routes/vapi-webhooks.js');
    const app = createContractApp({ mounts: [{ path: '/', router }] });

    await request(app)
      .post('/webhooks/vapi')
      .send({
        type: 'end-of-call-report',
        call: {
          id: 'call_eocr_disabled',
          assistantId: 'b19a474b-49f3-474d-adb2-4aacc6ad37e7',
          status: 'ended',
          endedReason: 'customer-ended-call',
          duration: 30,
          artifact: { transcript: CALLBACK_TRANSCRIPT, structuredOutputs: [] }
        },
        message: { type: 'end-of-call-report', call: { id: 'call_eocr_disabled' } },
        metadata: { tenantKey: 'c1', correlationId: 'eocr-disabled', leadPhone: '+447700900000' }
      })
      .expect(200);
    await flushAsync();
    expect(sendEmail).not.toHaveBeenCalledWith(
      expect.objectContaining({ subject: expect.stringMatching(/Callback needed/i) })
    );
  });
});

describe('Vapi webhook assistant-mismatch fallback path (lines ~1574-1627)', () => {
  test('non-logistics assistant updates existing sheet row by phone and short-circuits append', async () => {
    updateLogisticsRowByPhone.mockResolvedValue(true);
    const { default: router } = await import('../../routes/vapi-webhooks.js');
    const app = createContractApp({ mounts: [{ path: '/', router }] });

    await request(app)
      .post('/webhooks/vapi')
      .send({
        type: 'end-of-call-report',
        call: {
          id: 'call_other_asst',
          assistantId: 'some-other-assistant-id',
          status: 'ended',
          endedReason: 'customer-ended-call',
          recordingUrl: 'https://r/3',
          artifact: { transcript: LONG_TRANSCRIPT_OK, structuredOutputs: [] }
        },
        message: { type: 'end-of-call-report', call: { id: 'call_other_asst' } },
        metadata: { tenantKey: 'c1', correlationId: 'mismatch-1', leadPhone: '+447700900000' }
      })
      .expect(200);
    await flushAsync();
    expect(updateLogisticsRowByPhone).toHaveBeenCalledWith(
      'sheet_123',
      '+447700900000',
      expect.objectContaining({ callId: 'call_other_asst' })
    );
    expect(appendLogistics).not.toHaveBeenCalled();
  });

  test('assistant-mismatch fallback: when row not found, neither append nor crash; just markProcessed', async () => {
    updateLogisticsRowByPhone.mockResolvedValue(false);
    const { default: router } = await import('../../routes/vapi-webhooks.js');
    const app = createContractApp({ mounts: [{ path: '/', router }] });

    await request(app)
      .post('/webhooks/vapi')
      .send({
        type: 'end-of-call-report',
        call: {
          id: 'call_mm_norow',
          assistantId: 'wrong-asst',
          endedReason: 'customer-ended-call',
          recordingUrl: 'https://r/4',
          artifact: { transcript: LONG_TRANSCRIPT_OK, structuredOutputs: [] }
        },
        message: { type: 'end-of-call-report', call: { id: 'call_mm_norow' } },
        metadata: { tenantKey: 'c1', correlationId: 'mm-2', leadPhone: '+447700900001' }
      })
      .expect(200);
    await flushAsync();
    expect(appendLogistics).not.toHaveBeenCalled();
  });

  test('assistant-mismatch fallback: update error triggers operator alert (no crash)', async () => {
    updateLogisticsRowByPhone.mockRejectedValue(new Error('sheet api 500'));
    const { default: router } = await import('../../routes/vapi-webhooks.js');
    const app = createContractApp({ mounts: [{ path: '/', router }] });

    await request(app)
      .post('/webhooks/vapi')
      .send({
        type: 'end-of-call-report',
        call: {
          id: 'call_mm_err',
          assistantId: 'wrong-asst',
          endedReason: 'customer-ended-call',
          recordingUrl: 'https://r/5',
          artifact: { transcript: LONG_TRANSCRIPT_OK, structuredOutputs: [] }
        },
        message: { type: 'end-of-call-report', call: { id: 'call_mm_err' } },
        metadata: { tenantKey: 'c1', correlationId: 'mm-3', leadPhone: '+447700900002' }
      })
      .expect(200);
    await flushAsync();
    expect(sendOperatorAlert).toHaveBeenCalledWith(
      expect.objectContaining({ dedupeKey: expect.stringContaining('logistics-sheet-update:') })
    );
  });
});

describe('Vapi webhook outcome dispatch (lines ~1803-1915)', () => {
  test('outcome=booked is acknowledged and routes through booking handler without throwing', async () => {
    mapVapiEndedReasonToOutcome.mockReturnValue('booked');
    const { default: router } = await import('../../routes/vapi-webhooks.js');
    const app = createContractApp({ mounts: [{ path: '/', router }] });

    const res = await request(app)
      .post('/webhooks/vapi')
      .send({
        type: 'end-of-call-report',
        call: {
          id: 'call_booked',
          assistantId: 'b19a474b-49f3-474d-adb2-4aacc6ad37e7',
          endedReason: 'customer-ended-call',
          artifact: { transcript: '', structuredOutputs: [] }
        },
        message: { type: 'end-of-call-report', call: { id: 'call_booked' } },
        booked: true,
        bookingStart: '2024-01-01T09:00',
        bookingEnd: '2024-01-01T10:00',
        metadata: { tenantKey: 'c1', correlationId: 'booked-1', leadPhone: '+44' }
      })
      .expect(200);
    expect(res.body).toEqual(expect.objectContaining({ ok: true, received: true }));
  });

  test('outcome=no-answer routes through failed-call handler without throwing', async () => {
    mapVapiEndedReasonToOutcome.mockReturnValue('no-answer');
    const { default: router } = await import('../../routes/vapi-webhooks.js');
    const app = createContractApp({ mounts: [{ path: '/', router }] });

    const res = await request(app)
      .post('/webhooks/vapi')
      .send({
        type: 'end-of-call-report',
        call: {
          id: 'call_noanswer',
          assistantId: 'b19a474b-49f3-474d-adb2-4aacc6ad37e7',
          endedReason: 'customer-did-not-answer',
          artifact: { transcript: '', structuredOutputs: [] }
        },
        message: { type: 'end-of-call-report', call: { id: 'call_noanswer' } },
        metadata: { tenantKey: 'c1', correlationId: 'noans-1', leadPhone: '+44' }
      })
      .expect(200);
    expect(res.body).toEqual(expect.objectContaining({ ok: true }));
  });
});
