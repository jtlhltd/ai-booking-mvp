/**
 * Canary for Intent Contract: dial.imports-distribute-not-burst
 * Also covers: queue.spread-min-spacing
 *
 * A 50-lead import must:
 *   1. NOT call fetch('https://api.vapi.ai/call', ...) directly.
 *   2. Enqueue every lead via addToCallQueue with callType 'vapi_call'.
 *   3. Spread scheduled_for across time — no two adjacent slots may share an
 *      exact instant, and the total span must be > 0.
 *
 * This canary reproduces the regression that consumed $20 of Vapi credits in
 * minutes (routes/import-leads.js used to call processCallQueue() synchronously
 * which dialed every lead at once). It must stay green.
 */
import { describe, expect, test, jest, beforeEach } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
  global.fetch = jest.fn(async () => {
    throw new Error('canary saw an unexpected fetch — would dial Vapi directly');
  });
});

describe('canary: dial.imports-distribute-not-burst / queue.spread-min-spacing', () => {
  test('runOutboundCallsForImportedLeads enqueues every lead and spreads scheduled_for', async () => {
    const addToCallQueue = jest.fn(async () => ({ id: Math.random() }));

    // Spaced base time. The function passes a movingBaseline argument through to
    // scheduleAtOptimalCallWindow; a faithful mock returns that baseline so the
    // function's internal min-spacing math is exercised.
    const scheduleAtOptimalCallWindow = jest.fn(async (_client, _routing, baseline) => {
      return new Date(baseline);
    });

    jest.unstable_mockModule('../../db.js', () => ({
      getFullClient: jest.fn(async () => ({
        clientKey: 'tenant-a',
        isEnabled: true,
        vapi: { assistantId: 'asst_x' }
      })),
      getLatestCallInsights: jest.fn(async () => null),
      getCallTimeBanditState: jest.fn(async () => ({}))
    }));

    const { runOutboundCallsForImportedLeads } = await import('../../lib/lead-import-outbound.js');

    const inserted = Array.from({ length: 50 }, (_, i) => ({
      id: i + 1,
      phone: `+447700900${String(i).padStart(3, '0')}`,
      name: `Lead ${i + 1}`,
      service: 'Demo',
      source: 'Import',
      status: 'new'
    }));

    const summary = await runOutboundCallsForImportedLeads({
      clientKey: 'tenant-a',
      inserted,
      isBusinessHours: () => true,
      getNextBusinessHour: () => new Date('2030-06-02T09:00:00Z'),
      scheduleAtOptimalCallWindow,
      addToCallQueue,
      TIMEZONE: 'Europe/London'
    });

    expect(global.fetch).not.toHaveBeenCalled();

    expect(summary.queued).toBe(50);
    expect(summary.called).toBe(0);
    expect(summary.shouldCallNow).toBe(false);

    expect(addToCallQueue).toHaveBeenCalledTimes(50);

    const calls = addToCallQueue.mock.calls.map((c) => c[0]);
    for (const enqueued of calls) {
      expect(enqueued.callType).toBe('vapi_call');
      expect(enqueued.callData?.triggerType).toBe('new_lead_import');
      expect(enqueued.scheduledFor).toBeInstanceOf(Date);
    }

    const slots = calls.map((c) => new Date(c.scheduledFor).getTime()).sort((a, b) => a - b);
    const distinct = new Set(slots);
    expect(distinct.size).toBe(slots.length);

    const span = slots[slots.length - 1] - slots[0];
    expect(span).toBeGreaterThan(0);

    // LEAD_QUEUE_MIN_SPACING_MS defaults to 15s. Adjacent slots must respect it.
    const minSpacingMs = parseInt(process.env.LEAD_QUEUE_MIN_SPACING_MS || '15000', 10);
    for (let i = 1; i < slots.length; i++) {
      expect(slots[i] - slots[i - 1]).toBeGreaterThanOrEqual(minSpacingMs);
    }
  });
});
