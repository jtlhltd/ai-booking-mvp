/**
 * Isolated SQLite (:memory:) — dynamic import so Jest does not load db.js before env is set.
 * CI / local: npm run test:integration-db
 */
import { describe, test, expect, beforeAll, afterAll, jest } from '@jest/globals';

/** Fixed Wednesday UTC for deterministic weekday_mask / claim tests. */
const WED_UTC = new Date('2026-04-15T14:00:00.000Z');

const describeIf = process.env.RUN_SQLITE_INTEGRATION_TESTS === '1' ? describe : describe.skip;

describeIf('SQLite: addToCallQueue merge + outbound weekday journey', () => {
  let dbModule;
  let addToCallQueue;
  let claimOutboundWeekdayJourneySlot;
  let hasOutboundWeekdayJourneyDialBlocked;
  let closeOutboundWeekdayJourneyOnLivePickup;
  let clearOutboundWeekdayJourneyForReopen;
  let query;

  const prevDbType = process.env.DB_TYPE;
  const prevDbPath = process.env.DB_PATH;
  const prevDatabaseUrl = process.env.DATABASE_URL;
  const prevAllowMulti = process.env.ALLOW_MULTIPLE_OUTBOUND_CALLS_PER_DAY;

  beforeAll(async () => {
    jest.resetModules();
    process.env.DB_TYPE = '';
    process.env.DB_PATH = ':memory:';
    delete process.env.DATABASE_URL;
    delete process.env.ALLOW_MULTIPLE_OUTBOUND_CALLS_PER_DAY;

    dbModule = await import('../../db.js');
    await dbModule.init();
    addToCallQueue = dbModule.addToCallQueue;
    claimOutboundWeekdayJourneySlot = dbModule.claimOutboundWeekdayJourneySlot;
    hasOutboundWeekdayJourneyDialBlocked = dbModule.hasOutboundWeekdayJourneyDialBlocked;
    closeOutboundWeekdayJourneyOnLivePickup = dbModule.closeOutboundWeekdayJourneyOnLivePickup;
    clearOutboundWeekdayJourneyForReopen = dbModule.clearOutboundWeekdayJourneyForReopen;
    query = dbModule.query;
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
    if (prevDbType === undefined) delete process.env.DB_TYPE;
    else process.env.DB_TYPE = prevDbType;
    if (prevDbPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = prevDbPath;
    if (prevDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = prevDatabaseUrl;
    if (prevAllowMulti === undefined) delete process.env.ALLOW_MULTIPLE_OUTBOUND_CALLS_PER_DAY;
    else process.env.ALLOW_MULTIPLE_OUTBOUND_CALLS_PER_DAY = prevAllowMulti;
    jest.resetModules();
  });

  test('request-queue handles only sms_send + lead_import', async () => {
    const rq = await import('../../lib/request-queue.js');
    expect(rq.REQUEST_QUEUE_HANDLED_CALL_TYPES).toEqual(['sms_send', 'lead_import']);
  });

  test('enqueueRequest rejects unknown and vapi_call types', async () => {
    const rq = await import('../../lib/request-queue.js');
    const unk = await rq.enqueueRequest({ clientKey: 't', requestType: 'unknown', payload: { phone: '1' } });
    expect(unk.success).toBe(false);
    const vapi = await rq.enqueueRequest({ clientKey: 't', requestType: 'vapi_call', payload: {} });
    expect(vapi.success).toBe(false);
  });

  test('addToCallQueue merges vapi_call by digit key on SQLite', async () => {
    const clientKey = 'tenant-merge-1';
    await query(`INSERT INTO tenants (client_key, display_name) VALUES ($1, $2)`, [clientKey, 'Merge tenant']);
    const past = new Date(Date.now() - 120_000).toISOString();
    const r1 = await addToCallQueue({
      clientKey,
      leadPhone: '+447700900999',
      priority: 5,
      scheduledFor: new Date(past),
      callType: 'vapi_call',
      callData: { a: 1 }
    });
    const r2 = await addToCallQueue({
      clientKey,
      leadPhone: '07700 900 999',
      priority: 3,
      scheduledFor: new Date(),
      callType: 'vapi_call',
      callData: { b: 2 }
    });
    expect(r2.id).toBe(r1.id);
    expect(Number(r2.priority)).toBe(3);
    const { rows } = await query(`SELECT COUNT(*) AS n FROM call_queue WHERE client_key = $1`, [clientKey]);
    expect(Number(rows[0].n)).toBe(1);
  });

  test('addToCallQueue does not merge different __nodigits__ raw strings', async () => {
    const clientKey = 'tenant-weak-1';
    await query(`INSERT INTO tenants (client_key, display_name) VALUES ($1, $2)`, [clientKey, 'Weak']);
    const a = await addToCallQueue({
      clientKey,
      leadPhone: 'no-digits-a',
      priority: 5,
      scheduledFor: new Date(),
      callType: 'vapi_call',
      callData: {}
    });
    const b = await addToCallQueue({
      clientKey,
      leadPhone: 'no-digits-b',
      priority: 5,
      scheduledFor: new Date(),
      callType: 'vapi_call',
      callData: {}
    });
    expect(b.id).not.toBe(a.id);
    const { rows } = await query(`SELECT COUNT(*) AS n FROM call_queue WHERE client_key = $1`, [clientKey]);
    expect(Number(rows[0].n)).toBe(2);
  });

  test('weekday journey: first claim ok, second same day blocked', async () => {
    const clientKey = 'tenant-journey-1';
    await query(`INSERT INTO tenants (client_key, display_name) VALUES ($1, $2)`, [clientKey, 'Journey']);
    const phone = '+447711111113';
    const opts = { asOf: WED_UTC };
    const r1 = await claimOutboundWeekdayJourneySlot(clientKey, phone, 'UTC', opts);
    expect(r1.ok).toBe(true);
    const r2 = await claimOutboundWeekdayJourneySlot(clientKey, phone, 'UTC', opts);
    expect(r2.ok).toBe(false);
    expect(r2.reason).toBe('weekday_slot_used');
    const blk = await hasOutboundWeekdayJourneyDialBlocked(clientKey, phone, 'UTC', opts);
    expect(blk.blocked).toBe(true);
    expect(blk.reason).toBe('weekday_slot_used');
  });

  test('weekday journey: live pickup closes journey', async () => {
    const clientKey = 'tenant-journey-2';
    await query(`INSERT INTO tenants (client_key, display_name) VALUES ($1, $2)`, [clientKey, 'Journey2']);
    const phone = '+447711111114';
    const opts = { asOf: WED_UTC };
    await claimOutboundWeekdayJourneySlot(clientKey, phone, 'UTC', opts);
    await closeOutboundWeekdayJourneyOnLivePickup(clientKey, phone);
    const r3 = await claimOutboundWeekdayJourneySlot(clientKey, phone, 'UTC', opts);
    expect(r3.ok).toBe(false);
    expect(r3.reason).toBe('journey_terminal');
    await clearOutboundWeekdayJourneyForReopen(clientKey, phone);
    const r4 = await claimOutboundWeekdayJourneySlot(clientKey, phone, 'UTC', opts);
    expect(r4.ok).toBe(true);
  });
});
