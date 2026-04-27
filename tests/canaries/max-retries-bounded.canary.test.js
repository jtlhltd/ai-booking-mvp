/**
 * Canary for Intent Contract: billing.max-retries-bounded
 *
 * sendRetryCall must refuse to enqueue a new follow-up retry once the lead
 * has already accumulated MAX_RETRIES_PER_LEAD vapi_call retries in the
 * configured window. This prevents stuck retry loops from generating an
 * unbounded number of Vapi calls (and credit spend) for the same lead.
 *
 * Asserts:
 *   - When the count query returns >= cap, sendRetryCall returns
 *     { ok: false, error: 'max_retries_exceeded' }.
 *   - addToCallQueue is NOT called.
 *   - global.fetch is NOT called.
 */
import { describe, expect, test, jest, beforeEach, afterEach } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  process.env.MAX_RETRIES_PER_LEAD = '3';
  process.env.MAX_RETRIES_PER_LEAD_WINDOW_HOURS = '24';
  global.fetch = jest.fn(async () => {
    throw new Error('canary saw an unexpected fetch — retry cap must block enqueue');
  });
});

afterEach(() => {
  delete process.env.MAX_RETRIES_PER_LEAD;
  delete process.env.MAX_RETRIES_PER_LEAD_WINDOW_HOURS;
});

describe('canary: billing.max-retries-bounded', () => {
  test('sendRetryCall refuses to enqueue when per-lead cap is reached', async () => {
    const addToCallQueue = jest.fn(async () => ({ id: 1 }));

    jest.unstable_mockModule('../../db.js', () => ({
      query: jest.fn(async (sql) => {
        const s = String(sql).toLowerCase();
        if (s.includes('from leads')) {
          return {
            rows: [{ name: 'Lead', phone: '+447700900555', service: 'demo', email: null }]
          };
        }
        if (s.includes('from call_queue') && s.includes('count(')) {
          // 3 prior retries already exist for this lead in the window.
          return { rows: [{ n: 3 }] };
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
      scheduleAtOptimalCallWindow: jest.fn(async () => new Date('2030-06-01T10:00:00Z'))
    }));
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
      leadPhone: '+447700900555',
      data: { leadId: 1, leadName: 'Lead', service: 'demo', retryQueueId: 99 }
    });

    expect(result).toEqual(
      expect.objectContaining({ ok: false, queued: false, error: 'max_retries_exceeded' })
    );

    expect(addToCallQueue).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('sendRetryCall enqueues normally when under the cap', async () => {
    const addToCallQueue = jest.fn(async () => ({ id: 1 }));

    jest.unstable_mockModule('../../db.js', () => ({
      query: jest.fn(async (sql) => {
        const s = String(sql).toLowerCase();
        if (s.includes('from leads')) {
          return {
            rows: [{ name: 'Lead', phone: '+447700900666', service: 'demo', email: null }]
          };
        }
        if (s.includes('from call_queue') && s.includes('count(')) {
          // Only 1 prior retry; cap is 3, so this attempt should proceed.
          return { rows: [{ n: 1 }] };
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
      scheduleAtOptimalCallWindow: jest.fn(async () => new Date('2030-06-01T10:00:00Z'))
    }));
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
      leadPhone: '+447700900666',
      data: { leadId: 2, leadName: 'Lead', service: 'demo', retryQueueId: 100 }
    });

    expect(result.ok).toBe(true);
    expect(result.queued).toBe(true);
    expect(addToCallQueue).toHaveBeenCalledTimes(1);
  });
});
