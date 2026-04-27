/**
 * Canary for Intent Contract: queue.concurrency-cap
 *
 * acquireVapiSlot must enforce VAPI_MAX_CONCURRENT. With the cap at 2:
 *   - The first 2 acquires resolve immediately.
 *   - The 3rd stays pending until a release happens.
 *   - getVapiConcurrencyState() reports current === max while saturated.
 *
 * Without this gate the worker can burst many in-flight Vapi calls and
 * blow past Vapi's per-org concurrency limit (and our cost expectations).
 */
import { describe, expect, test, jest, beforeEach, afterEach } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
  process.env.VAPI_MAX_CONCURRENT = '2';
  process.env.VAPI_SLOT_WAIT_MS = '5000';
});

afterEach(() => {
  delete process.env.VAPI_MAX_CONCURRENT;
  delete process.env.VAPI_SLOT_WAIT_MS;
});

describe('canary: queue.concurrency-cap', () => {
  test('acquireVapiSlot blocks the surplus until a slot is released', async () => {
    const mod = await import('../../lib/instant-calling.js');

    await mod.acquireVapiSlot({});
    await mod.acquireVapiSlot({});

    let stateAfterTwo = mod.getVapiConcurrencyState();
    expect(stateAfterTwo.max).toBe(2);
    expect(stateAfterTwo.current).toBe(2);

    let resolved = false;
    const third = mod.acquireVapiSlot({}).then(() => {
      resolved = true;
    });

    // Give the event loop a tick; the third must NOT resolve yet.
    await new Promise((r) => setImmediate(r));
    expect(resolved).toBe(false);

    const stateWhileQueued = mod.getVapiConcurrencyState();
    expect(stateWhileQueued.current).toBe(2);
    expect(stateWhileQueued.queued).toBeGreaterThanOrEqual(1);

    // Release one slot; the third acquire should now resolve.
    mod.releaseVapiSlot({ reason: 'canary_release_one' });
    await third;
    expect(resolved).toBe(true);

    // Cleanup: drain remaining slots so other tests start from zero.
    mod.releaseVapiSlot({ reason: 'canary_cleanup_1' });
    mod.releaseVapiSlot({ reason: 'canary_cleanup_2' });
    const final = mod.getVapiConcurrencyState();
    expect(final.current).toBe(0);
  });
});
