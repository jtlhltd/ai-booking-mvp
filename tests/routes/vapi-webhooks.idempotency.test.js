import { describe, expect, test, jest } from '@jest/globals';
import request from 'supertest';

import { createContractApp } from '../helpers/contract-harness.js';

// Minimal mocks so the webhook handler can run without touching real services.
jest.unstable_mockModule('../../middleware/vapi-webhook-verification.js', () => ({
  verifyVapiSignature: (_req, _res, next) => next()
}));

let insertCount = 0;
jest.unstable_mockModule('../../db.js', () => ({
  dbType: 'postgres',
  query: jest.fn(async (sql) => {
    const s = String(sql);
    if (s.includes('INSERT INTO webhook_events')) {
      insertCount += 1;
      // first delivery inserts, second delivery dedupes (no returning rows)
      return insertCount === 1 ? { rows: [{ id: 1 }] } : { rows: [] };
    }
    if (s.includes('UPDATE webhook_events') && s.includes('RETURNING id')) {
      // do not allow re-claim for this test
      return { rows: [] };
    }
    return { rows: [] };
  }),
  // downstream dynamic imports from vapi-webhooks.js expect these to exist
  upsertCall: jest.fn(async () => {}),
  trackCost: jest.fn(async () => {}),
  recordOutboundAbLivePickups: jest.fn(async () => {}),
  closeOutboundWeekdayJourneyOnLivePickup: jest.fn(async () => {}),
  recordCallTimeBanditAfterCallComplete: jest.fn(async () => {}),
  recordABTestOutcome: jest.fn(async () => {})
}));

jest.unstable_mockModule('../../store.js', () => ({
  getFullClient: jest.fn(async () => null),
  // referenced in some paths; keep minimal to avoid runtime crashes
  leads: {},
  optouts: {},
  contactAttempts: {},
  twilio: {}
}));
jest.unstable_mockModule('../../sheets.js', () => ({}));
jest.unstable_mockModule('../../lib/call-quality-analysis.js', () => ({
  analyzeCall: () => ({ sentiment: 'neutral', qualityScore: 0, objections: [], keyPhrases: [], analyzedAt: new Date().toISOString() })
}));
jest.unstable_mockModule('../../lib/messaging-service.js', () => ({ default: { sendEmail: jest.fn(async () => ({ ok: true })) } }));
jest.unstable_mockModule('../../lib/operator-alerts.js', () => ({ sendOperatorAlert: jest.fn(async () => ({ sent: false })) }));
jest.unstable_mockModule('../../lib/logistics-extractor.js', () => ({ extractLogisticsFields: () => ({}) }));
jest.unstable_mockModule('../../lib/demo-telemetry.js', () => ({ recordReceptionistTelemetry: jest.fn(async () => {}) }));
jest.unstable_mockModule('../../lib/call-context-cache.js', () => ({ storeCallContext: jest.fn(() => {}) }));
jest.unstable_mockModule('../../lib/vapi-call-outcome-map.js', () => ({ mapVapiEndedReasonToOutcome: () => null }));
jest.unstable_mockModule('../../lib/vapi-webhook-verbose-log.js', () => ({ vapiWebhookVerboseLog: () => {} }));

describe('Vapi webhook idempotency', () => {
  test('second delivery is deduped by webhook_events (Postgres)', async () => {
    const { default: router } = await import('../../routes/vapi-webhooks.js');
    const app = createContractApp({ mounts: [{ path: '/', router }] });

    const payload = {
      message: { type: 'end-of-call-report', call: { id: 'call_1' } },
      metadata: { correlationId: 'c1' }
    };

    const r1 = await request(app).post('/webhooks/vapi').send(payload).expect(200);
    expect(r1.body).toEqual(expect.objectContaining({ ok: true, received: true }));

    const r2 = await request(app).post('/webhooks/vapi').send(payload).expect(200);
    expect(r2.body).toEqual(expect.objectContaining({ ok: true, received: true, deduped: true }));
  });
});

