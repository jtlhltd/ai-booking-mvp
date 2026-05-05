/**
 * Canary for Intent Contract: dial.imports-distribute-not-burst
 *
 * The legacy burst-dial path `lib/lead-import-outbound.js#processLeadImportOutboundCalls`
 * must be hard-disabled by default. It used to dial imported leads in a tight
 * loop (delayBetweenCalls=2s, maxCallsPerBatch=50) which is exactly the
 * regression that burned $20 of Vapi credits in minutes. The fix in PR-9 is:
 *
 *   1. The function throws unless `ALLOW_LEGACY_INSTANT_IMPORT_DIAL=1` is set.
 *   2. The in-memory dialer it used to call (`processCallQueue` in
 *      `lib/instant-calling.js`) was renamed to `dialLeadsNowBatch` so a
 *      future caller cannot import the old name and quietly re-introduce
 *      burst dialing.
 *
 * This canary locks in both halves of the fix.
 */

import { describe, expect, test, jest, beforeEach, afterEach } from '@jest/globals';

const ENV_VAR = 'ALLOW_LEGACY_INSTANT_IMPORT_DIAL';

let savedFlag;

beforeEach(() => {
  jest.resetModules();
  savedFlag = process.env[ENV_VAR];
  delete process.env[ENV_VAR];
  global.fetch = jest.fn(async () => {
    throw new Error('canary saw an unexpected fetch — would dial Vapi directly');
  });
});

afterEach(() => {
  if (savedFlag === undefined) delete process.env[ENV_VAR];
  else process.env[ENV_VAR] = savedFlag;
});

describe('canary: legacy instant-import dial path is gated by env', () => {
  test('processLeadImportOutboundCalls throws by default (no env flag)', async () => {
    const mod = await import('../../lib/lead-import-outbound.js');
    await expect(
      mod.processLeadImportOutboundCalls({
        clientKey: 'tenant-a',
        client: { client_key: 'tenant-a' },
        inserted: [
          { id: 1, phone: '+447700900001', name: 'A' },
          { id: 2, phone: '+447700900002', name: 'B' }
        ]
      })
    ).rejects.toThrow(/disabled|ALLOW_LEGACY_INSTANT_IMPORT_DIAL/);

    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('processLeadImportOutboundCalls throws on inert flag values (0/false/no/off/empty)', async () => {
    const mod = await import('../../lib/lead-import-outbound.js');
    for (const v of ['0', 'false', 'no', 'off', '']) {
      process.env[ENV_VAR] = v;
      await expect(
        mod.processLeadImportOutboundCalls({
          clientKey: 'tenant-a',
          client: { client_key: 'tenant-a' },
          inserted: [{ id: 1, phone: '+447700900001', name: 'A' }]
        })
      ).rejects.toThrow();
    }
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('lib/instant-calling.js no longer exports processCallQueue (renamed to dialLeadsNowBatch)', async () => {
    const mod = await import('../../lib/instant-calling.js');
    expect(mod.processCallQueue).toBeUndefined();
    expect(typeof mod.dialLeadsNowBatch).toBe('function');
  });

  test(
    'a 50-lead import via the safe path issues zero direct Vapi fetches and never invokes dialLeadsNowBatch',
    async () => {
      const addToCallQueue = jest.fn(async () => ({ id: Math.random() }));
      const scheduleAtOptimalCallWindow = jest.fn(async (_client, _routing, baseline) => {
        return new Date(baseline);
      });

      const dialLeadsNowBatchSpy = jest.fn();
      jest.unstable_mockModule('../../lib/instant-calling.js', () => ({
        dialLeadsNowBatch: dialLeadsNowBatchSpy
      }));

      jest.unstable_mockModule('../../db.js', () => ({
        getFullClient: jest.fn(async () => ({
          clientKey: 'tenant-a',
          isEnabled: true,
          vapi: { assistantId: 'asst_x' }
        })),
        getLatestCallInsights: jest.fn(async () => null),
        getCallTimeBanditState: jest.fn(async () => ({}))
      }));

      const { runOutboundCallsForImportedLeads } = await import(
        '../../lib/lead-import-outbound.js'
      );

      const inserted = Array.from({ length: 50 }, (_, i) => ({
        id: i + 1,
        phone: `+447700900${String(i).padStart(3, '0')}`,
        name: `Lead ${i + 1}`,
        service: 'Demo',
        source: 'Import',
        status: 'new'
      }));

      await runOutboundCallsForImportedLeads({
        clientKey: 'tenant-a',
        inserted,
        isBusinessHours: () => true,
        getNextBusinessHour: () => new Date('2030-06-02T09:00:00Z'),
        scheduleAtOptimalCallWindow,
        addToCallQueue,
        TIMEZONE: 'Europe/London'
      });

      expect(global.fetch).not.toHaveBeenCalled();
      expect(dialLeadsNowBatchSpy).not.toHaveBeenCalled();
      expect(addToCallQueue).toHaveBeenCalledTimes(50);
    }
  );
});
