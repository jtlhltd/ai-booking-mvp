import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import request from 'supertest';

import { createContractApp } from '../helpers/contract-harness.js';

beforeEach(() => {
  jest.resetModules();
});

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
  recordCallTimeBanditAfterCallComplete: jest.fn(async () => {})
}));

jest.unstable_mockModule('../../store.js', () => ({
  getFullClient: jest.fn(async () => ({ clientKey: 'c1', vapi: {}, gsheet_id: null }))
}));
jest.unstable_mockModule('../../lib/messaging-service.js', () => ({ default: { sendEmail: jest.fn(async () => ({ ok: true })) } }));
jest.unstable_mockModule('../../sheets.js', () => ({
  updateLogisticsRowByPhone: jest.fn(async () => true),
  appendLogistics: jest.fn(async () => {})
}));
jest.unstable_mockModule('../../lib/call-quality-analysis.js', () => ({
  analyzeCall: () => ({ sentiment: 'neutral', qualityScore: 0, objections: [], keyPhrases: [], analyzedAt: new Date().toISOString() })
}));
jest.unstable_mockModule('../../lib/operator-alerts.js', () => ({ sendOperatorAlert: jest.fn(async () => ({ sent: false })) }));
jest.unstable_mockModule('../../lib/logistics-extractor.js', () => ({ extractLogisticsFields: () => ({}) }));
jest.unstable_mockModule('../../lib/demo-telemetry.js', () => ({
  recordReceptionistTelemetry: jest.fn(async () => {}),
  recordDemoTelemetry: jest.fn(async () => {})
}));
jest.unstable_mockModule('../../lib/call-context-cache.js', () => ({ storeCallContext: jest.fn(() => {}) }));
jest.unstable_mockModule('../../lib/vapi-call-outcome-map.js', () => ({ mapVapiEndedReasonToOutcome: () => 'no-answer' }));
jest.unstable_mockModule('../../lib/vapi-webhook-verbose-log.js', () => ({ vapiWebhookVerboseLog: () => {} }));
jest.unstable_mockModule('../../lib/vapi-function-handlers.js', () => ({
  handleVapiFunctionCall: jest.fn(async () => ({ success: true, data: { ok: true } }))
}));
jest.unstable_mockModule('../../lib/follow-up-sequences.js', () => ({
  scheduleFollowUps: jest.fn(async () => ({ ok: true }))
}));

describe('Vapi webhook critical branches', () => {
  test('deduped event returns 200 {deduped:true} when insert no-ops and claim fails', async () => {
    query.mockReset().mockImplementation(async (sql) => {
      const s = String(sql);
      if (s.includes('INSERT INTO webhook_events')) return { rows: [] }; // already exists
      if (s.includes('UPDATE webhook_events') && s.includes('RETURNING id')) return { rows: [] }; // can't claim
      return { rows: [] };
    });

    const { default: router } = await import('../../routes/vapi-webhooks.js');
    const app = createContractApp({ mounts: [{ path: '/', router }] });

    const payload = {
      type: 'end-of-call-report',
      call: { id: 'call_dedup' },
      message: { type: 'end-of-call-report', call: { id: 'call_dedup' } },
      metadata: { tenantKey: 'c1', correlationId: 'dedupe-1', leadPhone: '+447700900000' }
    };

    const res = await request(app).post('/webhooks/vapi').send(payload).expect(200);
    expect(res.body).toEqual(expect.objectContaining({ ok: true, received: true, deduped: true }));
  });

  test('conversation-update short-circuits and marks processed', async () => {
    const processedUpdates = [];
    query.mockReset().mockImplementation(async (sql, args) => {
      const s = String(sql);
      if (s.includes('INSERT INTO webhook_events')) return { rows: [{ id: 1 }] };
      if (s.includes('SET processed_at = NOW()')) {
        processedUpdates.push({ sql: s, args });
        return { rows: [] };
      }
      return { rows: [] };
    });

    const { default: router } = await import('../../routes/vapi-webhooks.js');
    const app = createContractApp({ mounts: [{ path: '/', router }] });

    const payload = {
      message: {
        type: 'conversation-update',
        call: { id: 'call_conv_1' },
        messages: [{ role: 'user', content: 'hi' }]
      },
      metadata: { tenantKey: 'c1', correlationId: 'conv-1' }
    };

    const res = await request(app).post('/webhooks/vapi').send(payload).expect(200);
    expect(res.body).toEqual(expect.objectContaining({ ok: true, received: true }));
    expect(processedUpdates.length).toBeGreaterThanOrEqual(1);
  });

  test('missing webhook_events table degrades to allow 200', async () => {
    query.mockReset().mockImplementation(async (sql) => {
      const s = String(sql);
      if (s.includes('INSERT INTO webhook_events')) {
        const err = new Error('relation "webhook_events" does not exist');
        throw err;
      }
      return { rows: [] };
    });

    const { default: router } = await import('../../routes/vapi-webhooks.js');
    const app = createContractApp({ mounts: [{ path: '/', router }] });

    const payload = {
      type: 'end-of-call-report',
      call: { id: 'call_no_table' },
      message: { type: 'end-of-call-report', call: { id: 'call_no_table' } },
      metadata: { tenantKey: 'c1', correlationId: 'no-table-1' }
    };

    const res = await request(app).post('/webhooks/vapi').send(payload).expect(200);
    expect(res.body).toEqual(expect.objectContaining({ ok: true, received: true }));
  });

  test('minimal empty JSON body still returns 200 received', async () => {
    query.mockReset().mockImplementation(async (sql) => {
      if (String(sql).includes('INSERT INTO webhook_events')) return { rows: [{ id: 1 }] };
      return { rows: [] };
    });

    const { default: router } = await import('../../routes/vapi-webhooks.js');
    const app = createContractApp({ mounts: [{ path: '/', router }] });

    const res = await request(app).post('/webhooks/vapi').send({}).expect(200);
    expect(res.body).toEqual(expect.objectContaining({ ok: true, received: true }));
  });

  test('end-of-call-report maps endedReason->outcome, upserts call, handles tool calls, and triggers followups', async () => {
    query.mockReset().mockImplementation(async (sql) => {
      const s = String(sql);
      if (s.includes('INSERT INTO webhook_events')) return { rows: [{ id: 1 }] };
      if (s.includes('UPDATE webhook_events') && s.includes('SET processing_started_at')) return { rows: [] };
      if (s.includes('UPDATE webhook_events') && s.includes('SET processed_at')) return { rows: [] };
      return { rows: [] };
    });

    const { upsertCall } = await import('../../db.js');

    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true })
    }));

    const { default: router } = await import('../../routes/vapi-webhooks.js');
    const app = createContractApp({ mounts: [{ path: '/', router }] });

    const payload = {
      type: 'end-of-call-report',
      call: {
        id: 'call_eocr_1',
        status: 'ended',
        outcome: 'failed',
        endedReason: 'customer-did-not-answer',
        duration: 12,
        cost: 0.12,
        assistantId: 'b19a474b-49f3-474d-adb2-4aacc6ad37e7',
        customer: { name: 'Acme Ltd' },
        recordingUrl: 'https://recording.test/1',
        artifact: {
          transcript: 'User: hello',
          structuredOutputs: [{ result: { Email: 'a@b.com', 'International (Y/N)': 'N' } }]
        },
        metadata: { callPurpose: 'outbound', businessName: 'Acme Ltd' }
      },
      message: {
        type: 'end-of-call-report',
        call: { id: 'call_eocr_1' }
      },
      toolCalls: [
        { function: { name: 'get_business_info', arguments: JSON.stringify({ question: 'hours' }) } },
        { function: { name: 'calendar_checkAndBook', arguments: JSON.stringify({ lead: { name: 'Acme' } }) } }
      ],
      metadata: {
        tenantKey: 'c1',
        correlationId: 'eocr-1',
        leadPhone: '+447700900000',
        leadName: 'Acme Ltd',
        businessName: 'Acme Ltd'
      }
    };

    const res = await request(app).post('/webhooks/vapi').send(payload).expect(200);
    expect(res.body).toEqual(expect.objectContaining({ ok: true, received: true }));

    // Allow post-200 async processing + setImmediate deferred work to run.
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    expect(upsertCall).toHaveBeenCalledWith(expect.objectContaining({ callId: 'call_eocr_1', outcome: 'no-answer' }));
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/calendar/check-book'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  test('claims an existing unprocessed event when lease expired (tryClaimExistingWebhookEvent path)', async () => {
    query.mockReset().mockImplementation(async (sql) => {
      const s = String(sql);
      if (s.includes('INSERT INTO webhook_events')) return { rows: [] }; // already exists
      if (s.includes('RETURNING id') && s.includes('processing_started_at')) return { rows: [{ id: 1 }] }; // claim succeeds
      if (s.includes('SET processed_at = NOW()')) return { rows: [] };
      return { rows: [] };
    });

    const { default: router } = await import('../../routes/vapi-webhooks.js');
    const app = createContractApp({ mounts: [{ path: '/', router }] });

    const payload = {
      message: { type: 'conversation-update', call: { id: 'call_lease_1' }, messages: [{ role: 'user', content: 'hi' }] },
      metadata: { tenantKey: 'c1', correlationId: 'lease-1' }
    };

    const res = await request(app).post('/webhooks/vapi').send(payload).expect(200);
    expect(res.body).toEqual(expect.objectContaining({ ok: true, received: true }));
  });

  test('function-call event triggers tool handler but skips logistics append', async () => {
    query.mockReset().mockImplementation(async (sql) => {
      const s = String(sql);
      if (s.includes('INSERT INTO webhook_events')) return { rows: [{ id: 1 }] };
      if (s.includes('SET processed_at = NOW()')) return { rows: [] };
      return { rows: [] };
    });

    const { handleVapiFunctionCall } = await import('../../lib/vapi-function-handlers.js');
    const { appendLogistics } = await import('../../sheets.js');

    const { default: router } = await import('../../routes/vapi-webhooks.js');
    const app = createContractApp({ mounts: [{ path: '/', router }] });

    const payload = {
      message: {
        type: 'function-call',
        call: { id: 'call_fn_1' },
      },
      // toolCalls is what the route actually uses for function handling
      toolCalls: [{ function: { name: 'get_business_info', arguments: JSON.stringify({ question: 'hours' }) } }],
      metadata: { tenantKey: 'c1', correlationId: 'fn-1', leadPhone: '+447700900000' }
    };

    const res = await request(app).post('/webhooks/vapi').send(payload).expect(200);
    expect(res.body).toEqual(expect.objectContaining({ ok: true, received: true }));
    await new Promise((r) => setImmediate(r));
    expect(handleVapiFunctionCall).toHaveBeenCalled();
    expect(appendLogistics).not.toHaveBeenCalled();
  });
});

