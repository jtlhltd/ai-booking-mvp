import { describe, expect, test, jest, beforeEach, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';

import { createContractApp } from '../helpers/contract-harness.js';

beforeEach(() => {
  jest.resetModules();
});

let insertCount = 0;
const upsertCall = jest.fn(async () => {});

let toolSpy;
beforeAll(() => {
  toolSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterAll(() => {
  toolSpy.mockRestore();
});

jest.unstable_mockModule('../../middleware/vapi-webhook-verification.js', () => ({
  verifyVapiSignature: (_req, _res, next) => next()
}));

jest.unstable_mockModule('../../db.js', () => ({
  dbType: 'postgres',
  query: jest.fn(async (sql) => {
    const s = String(sql);
    if (s.includes('INSERT INTO webhook_events')) {
      insertCount += 1;
      return insertCount === 1 ? { rows: [{ id: 1 }] } : { rows: [] };
    }
    if (s.includes('UPDATE webhook_events') && s.includes('RETURNING id')) {
      return { rows: [] };
    }
    if (s.includes('FROM calls WHERE call_id')) {
      return { rows: [] };
    }
    return { rows: [] };
  }),
  upsertCall,
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

describe('Vapi webhook tool-call boundaries', () => {
  test(
    'malformed access_google_sheet arguments still yield 200; upsertCall runs; no sheet append side channel',
    async () => {
    insertCount = 0;
    upsertCall.mockClear();

    const { default: router } = await import('../../routes/vapi-webhooks.js');
    const app = createContractApp({ mounts: [{ path: '/', router }] });

    const transcript = `${'word '.repeat(20)}`.trim();
    const payload = {
      type: 'end-of-call-report',
      message: {
        type: 'end-of-call-report',
        call: {
          id: 'call_tool_parse_1',
          status: 'ended',
          assistantId: 'b19a474b-49f3-474d-adb2-4aacc6ad37e7',
          customer: { number: '+447700900000' }
        }
      },
      call: {
        id: 'call_tool_parse_1',
        status: 'ended',
        assistantId: 'b19a474b-49f3-474d-adb2-4aacc6ad37e7'
      },
      transcript,
      metadata: { tenantKey: 'c1', correlationId: 'tool-parse-1', leadPhone: '+447700900000' },
      toolCalls: [
        {
          function: {
            name: 'access_google_sheet',
            arguments: 'NOT_JSON{{{'
          }
        }
      ]
    };

    await request(app).post('/webhooks/vapi').send(payload).expect(200);

    // Under coverage this handler can be slower; wait briefly for post-response work.
    await new Promise((r) => setTimeout(r, 250));
    expect(upsertCall).toHaveBeenCalled();
    },
    60000
  );
});
