/**
 * End-to-end-ish happy path (SQLite :memory:).
 *
 * Goal: exercise a minimal real journey:
 *   lead -> enqueue (call_queue) -> worker picks up -> Vapi call created (mocked) -> call persisted -> insights computed + stored.
 *
 * Opt-in only:
 *   RUN_SQLITE_INTEGRATION_TESTS=1 node --experimental-vm-modules node_modules/jest/bin/jest.js tests/integration/db-sqlite-happy-path-call-insights.test.js
 */
import { describe, test, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { computeAndStoreCallInsights } from '../../lib/call-insights-engine.js';

const describeIf = process.env.RUN_SQLITE_INTEGRATION_TESTS === '1' ? describe : describe.skip;

describeIf('SQLite happy path: call_queue -> call -> call_insights', () => {
  let dbModule;
  let query;
  let addToCallQueue;
  let getPendingCalls;
  let updateCallQueueStatus;
  let upsertCall;
  let upsertCallInsights;

  const prevEnv = {
    DB_TYPE: process.env.DB_TYPE,
    DB_PATH: process.env.DB_PATH,
    DATABASE_URL: process.env.DATABASE_URL,
    VAPI_PRIVATE_KEY: process.env.VAPI_PRIVATE_KEY,
    VAPI_ASSISTANT_ID: process.env.VAPI_ASSISTANT_ID,
    VAPI_PHONE_NUMBER_ID: process.env.VAPI_PHONE_NUMBER_ID,
    ALLOW_MULTIPLE_OUTBOUND_CALLS_PER_DAY: process.env.ALLOW_MULTIPLE_OUTBOUND_CALLS_PER_DAY
  };

  beforeAll(async () => {
    jest.resetModules();
    process.env.DB_TYPE = '';
    process.env.DB_PATH = ':memory:';
    delete process.env.DATABASE_URL;

    // Keep this test deterministic and not dependent on local clock/business hours.
    process.env.VAPI_PRIVATE_KEY = 'test-key';
    process.env.VAPI_ASSISTANT_ID = 'assistant_test';
    process.env.VAPI_PHONE_NUMBER_ID = 'phone_test';
    process.env.ALLOW_MULTIPLE_OUTBOUND_CALLS_PER_DAY = '1';

    dbModule = await import('../../db.js');
    await dbModule.init();
    query = dbModule.query;
    addToCallQueue = dbModule.addToCallQueue;
    getPendingCalls = dbModule.getPendingCalls;
    updateCallQueueStatus = dbModule.updateCallQueueStatus;
    upsertCall = dbModule.upsertCall;
    upsertCallInsights = dbModule.upsertCallInsights;
  });

  afterAll(async () => {
    try {
      const cache = await import('../../lib/cache.js');
      await cache.disconnectRedisClient();
    } catch (_) {
      /* ignore */
    }
    try {
      await dbModule?.closeDatabaseConnectionsForTests?.();
    } catch (_) {
      /* ignore */
    }

    for (const [k, v] of Object.entries(prevEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    jest.resetModules();
  });

  test('lead enqueued -> processed -> call saved -> insights row written', async () => {
    const clientKey = 'tenant-happy-1';
    await query(`INSERT INTO tenants (client_key, display_name) VALUES ($1, $2)`, [clientKey, 'Happy Path']);

    // 1) "Lead created" (minimal representation) + enqueue via call_queue.
    const lead = {
      phone: '+447700900111',
      name: 'Test Prospect',
      leadScore: 55,
      source: 'test'
    };
    const q = await addToCallQueue({
      clientKey,
      leadPhone: lead.phone,
      priority: 5,
      scheduledFor: new Date(Date.now() - 60_000),
      callType: 'vapi_call',
      callData: { triggerType: 'new_lead_import' }
    });
    expect(q?.id).toBeTruthy();

    // 2) "Worker picks up" pending row.
    const pending = await getPendingCalls(10);
    const ours = (pending || []).find((r) => r.client_key === clientKey);
    expect(ours).toBeTruthy();
    await updateCallQueueStatus(ours.id, 'processing');

    // 3) "Dial" (mock Vapi create-call).
    const fetchCalls = [];
    const prevFetch = globalThis.fetch;
    globalThis.fetch = async (url, opts) => {
      fetchCalls.push({ url: String(url), opts });
      if (String(url).includes('https://api.vapi.ai/call')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: 'call_happy_1' })
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    };

    let dial;
    try {
      const { callLeadInstantly } = await import('../../lib/instant-calling.js');
      dial = await callLeadInstantly({
        clientKey,
        lead,
        client: { displayName: 'Happy Path', booking: { timezone: 'UTC' }, vapi: { assistantId: 'assistant_test', phoneNumberId: 'phone_test' } },
        allowOutsideBusinessHours: true,
        callQueueId: ours.id
      });
    } finally {
      globalThis.fetch = prevFetch;
    }

    expect(fetchCalls.length).toBeGreaterThan(0);
    expect(dial).toEqual(expect.objectContaining({ ok: true }));
    expect(dial.id).toBe('call_happy_1');

    // 4) Persist call record (what the webhook would typically complete later).
    await upsertCall({
      callId: dial.id,
      clientKey,
      leadPhone: lead.phone,
      status: 'completed',
      outcome: 'booked',
      duration: 42,
      cost: 0.5,
      metadata: { triggerType: 'new_lead_import' },
      transcript: 'hello this is a test call transcript',
      sentiment: 'positive'
    });
    await updateCallQueueStatus(ours.id, 'completed');

    // 5) Compute + store insights (writes call_insights row).
    const out = await computeAndStoreCallInsights({
      query,
      clientKey,
      days: 30,
      timeZone: 'UTC',
      limit: 2000,
      upsertCallInsights
    });
    expect(out?.insights?.summary?.attempts).toBeGreaterThan(0);

    const { rows } = await query(
      `SELECT client_key, period_days, computed_at FROM call_insights WHERE client_key = $1 ORDER BY computed_at DESC LIMIT 1`,
      [clientKey]
    );
    expect(rows.length).toBe(1);
    expect(rows[0].client_key).toBe(clientKey);
  });
});

