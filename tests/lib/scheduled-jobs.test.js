import { describe, expect, test, jest, beforeEach, afterEach } from '@jest/globals';

const schedule = jest.fn();

jest.unstable_mockModule('node-cron', () => ({
  default: { schedule }
}));

const monitorAllClients = jest.fn(async () => {});
const processReminderQueue = jest.fn(async () => ({ processed: 0, failed: 0, success: 0 }));
const processFollowUpQueue = jest.fn(async () => ({ processed: 0, failed: 0 }));
const checkDatabaseHealth = jest.fn(async () => ({ status: 'healthy', consecutiveFailures: 0 }));
const monitorBackups = jest.fn(async () => ({ status: 'healthy' }));
const monitorAllBudgets = jest.fn(async () => ({ clientsChecked: 0, alertsFound: 0 }));
const checkPoolHealth = jest.fn(async () => {});
const processQueue = jest.fn(async () => ({ processed: 0 }));
const reapStuckCallQueueProcessing = jest.fn(async () => ({ reset: 0 }));
const reapStuckWebhookEventProcessing = jest.fn(async () => ({ reset: 0 }));
const checkOpsInvariants = jest.fn(async () => {});
const cleanupDLQ = jest.fn(async () => ({ deleted: 0 }));
const processWebhookRetryQueue = jest.fn(async () => ({ processed: 0, success: 0, failed: 0 }));

jest.unstable_mockModule('../../lib/quality-monitoring.js', () => ({ monitorAllClients }));
jest.unstable_mockModule('../../lib/appointment-reminders.js', () => ({ processReminderQueue }));
jest.unstable_mockModule('../../lib/follow-up-processor.js', () => ({ processFollowUpQueue }));
jest.unstable_mockModule('../../lib/database-health.js', () => ({ checkDatabaseHealth }));
jest.unstable_mockModule('../../lib/backup-monitoring.js', () => ({ monitorBackups }));
jest.unstable_mockModule('../../lib/cost-monitoring.js', () => ({ monitorAllBudgets }));
jest.unstable_mockModule('../../lib/connection-pool-monitor.js', () => ({ checkPoolHealth }));
jest.unstable_mockModule('../../lib/request-queue.js', () => ({ processQueue }));
jest.unstable_mockModule('../../lib/stuck-processing-reaper.js', () => ({
  reapStuckCallQueueProcessing,
  reapStuckWebhookEventProcessing
}));
jest.unstable_mockModule('../../lib/ops-invariants.js', () => ({ checkOpsInvariants }));
jest.unstable_mockModule('../../lib/dead-letter-queue.js', () => ({ cleanupDLQ }));
jest.unstable_mockModule('../../lib/webhook-retry.js', () => ({ processWebhookRetryQueue }));
jest.unstable_mockModule('../../lib/vapi-slot-lease.js', () => ({
  SQLITE_VAPI_SLOT_LEASES_DDL: '-- mocked',
  reapExpiredDbLeases: jest.fn(async () => 0),
  shouldUseDbSlotLeases: jest.fn(() => false)
}));
jest.unstable_mockModule('../../lib/query-performance-tracker.js', () => ({
  appendQueryPerformanceDailySnapshot: jest.fn(async () => ({ ok: true }))
}));

async function flushPromises(times = 1) {
  for (let i = 0; i < times; i++) {
    // Dynamic `import()` resolution and `.then(...)` callbacks run on the microtask queue.
    // Using Promise ticks avoids getting stuck under fake timers.
     
    await Promise.resolve();
  }
}

describe('registerScheduledJobs', () => {
  beforeEach(() => {
    schedule.mockClear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test('registers core cron schedules', async () => {
    const { registerScheduledJobs } = await import('../../lib/scheduled-jobs.js');

    const reg = registerScheduledJobs({
      processCallQueue: jest.fn(async () => {}),
      processRetryQueue: jest.fn(async () => {}),
      queueNewLeadsForCalling: jest.fn(async () => {}),
      sendScheduledReminders: jest.fn(async () => {})
    });

    // allow dynamic imports to resolve and schedule() calls to be registered
    await flushPromises(5);

    const expressions = schedule.mock.calls.map((c) => c[0]);
    expect(expressions).toEqual(expect.arrayContaining([
      '0-58/2 * * * *',
      '1-59/2 * * * *',
      '*/5 * * * *',
      '0 9 * * 1'
    ]));

    reg?.stop?.();
  });

  test('setInterval reminder processor calls deps and swallows errors', async () => {
    const sendScheduledReminders = jest.fn(async () => {});
    const { registerScheduledJobs } = await import('../../lib/scheduled-jobs.js');

    const reg = registerScheduledJobs({ sendScheduledReminders });
    await jest.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(sendScheduledReminders).toHaveBeenCalledTimes(1);

    sendScheduledReminders.mockImplementationOnce(async () => {
      throw new Error('boom');
    });

    await expect(jest.advanceTimersByTimeAsync(5 * 60 * 1000)).resolves.toBeUndefined();
    reg?.stop?.();
  });

  test('call queue cron invokes deps and does not throw when deps throw', async () => {
    const processCallQueue = jest.fn(async () => {});
    const { registerScheduledJobs } = await import('../../lib/scheduled-jobs.js');

    const reg = registerScheduledJobs({ processCallQueue });
    await flushPromises(5);

    const callQueueEntry = schedule.mock.calls.find((c) => c[0] === '0-58/2 * * * *');
    expect(callQueueEntry).toBeTruthy();

    const handler = callQueueEntry[1];
    await handler();
    expect(processCallQueue).toHaveBeenCalledTimes(1);

    processCallQueue.mockImplementationOnce(async () => {
      throw new Error('nope');
    });
    await expect(handler()).resolves.toBeUndefined();
    reg?.stop?.();
  });
});
