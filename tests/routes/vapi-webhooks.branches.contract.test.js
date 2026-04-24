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
jest.unstable_mockModule('../../sheets.js', () => ({}));
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
jest.unstable_mockModule('../../lib/vapi-call-outcome-map.js', () => ({ mapVapiEndedReasonToOutcome: () => null }));
jest.unstable_mockModule('../../lib/vapi-webhook-verbose-log.js', () => ({ vapiWebhookVerboseLog: () => {} }));

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
});

