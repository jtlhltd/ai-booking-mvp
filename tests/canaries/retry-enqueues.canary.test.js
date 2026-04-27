/**
 * Canary for Intent Contract: dial.retry-goes-through-scheduler
 *
 * sendRetryCall must enqueue a call_queue row and never dial Vapi directly.
 *
 * Asserts:
 *   - addToCallQueue called once with priority 7, callType 'vapi_call',
 *     callData.triggerType 'follow_up_retry'.
 *   - global.fetch never called.
 */
import { describe, expect, test, jest, beforeEach } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
  global.fetch = jest.fn(async () => {
    throw new Error('canary saw an unexpected fetch — retry must enqueue, not dial');
  });
});

describe('canary: dial.retry-goes-through-scheduler', () => {
  test('sendRetryCall enqueues a vapi_call row and never dials directly', async () => {
    const addToCallQueue = jest.fn(async () => ({ id: 1 }));
    const scheduledFor = new Date('2030-06-01T11:00:00Z');

    jest.unstable_mockModule('../../db.js', () => ({
      query: jest.fn(async (sql) => {
        const s = String(sql).toLowerCase();
        if (s.includes('from leads')) {
          return { rows: [{ name: 'Lead', phone: '+447700900111', service: 'demo', email: null }] };
        }
        return { rows: [] };
      }),
      getFullClient: jest.fn(async () => ({
        clientKey: 'tenant-a',
        displayName: 'Acme',
        booking: { timezone: 'Europe/London' },
        vapi: { assistantId: 'asst_x' }
      })),
      addToCallQueue,
      getLatestCallInsights: jest.fn(async () => null),
      getCallTimeBanditState: jest.fn(async () => ({}))
    }));
    jest.unstable_mockModule('../../lib/optimal-call-window.js', () => ({
      scheduleAtOptimalCallWindow: jest.fn(async () => scheduledFor)
    }));
    // Some lib modules are imported eagerly by follow-up-processor. Mock the
    // ones that touch IO so the import doesn't pull in db.js's real pool.
    jest.unstable_mockModule('../../lib/messaging-service.js', () => ({
      default: { sendSMS: jest.fn(), sendEmail: jest.fn() }
    }));
    jest.unstable_mockModule('../../lib/business-hours.js', () => ({
      isBusinessHoursForTenant: jest.fn(() => true),
      getNextBusinessOpenForTenant: jest.fn(() => new Date()),
      getTenantTimezone: jest.fn(() => 'Europe/London')
    }));

    const { sendRetryCall } = await import('../../lib/follow-up-processor.js');

    const result = await sendRetryCall({
      clientKey: 'tenant-a',
      leadPhone: '+447700900111',
      data: { leadId: 42, leadName: 'Lead', service: 'demo', retryQueueId: 99 }
    });

    expect(result).toEqual(expect.objectContaining({ ok: true, queued: true, scheduledFor: scheduledFor.toISOString() }));

    expect(global.fetch).not.toHaveBeenCalled();

    expect(addToCallQueue).toHaveBeenCalledTimes(1);
    const arg = addToCallQueue.mock.calls[0][0];
    expect(arg.priority).toBe(7);
    expect(arg.callType).toBe('vapi_call');
    expect(arg.leadPhone).toBe('+447700900111');
    expect(arg.callData?.triggerType).toBe('follow_up_retry');
    expect(arg.callData?.retryQueueId).toBe(99);
  });
});
