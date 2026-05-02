import { describe, expect, test, jest, beforeEach, afterEach } from '@jest/globals';

const scheduled = [];
const schedule = jest.fn((expr, fn) => {
  scheduled.push({ expr, fn });
  return { stop: jest.fn(), start: jest.fn() };
});

jest.unstable_mockModule('node-cron', () => ({
  default: { schedule }
}));

// Mock dynamically imported job modules (best-effort: just ensure they don't throw)
jest.unstable_mockModule('../../..//lib/quality-monitoring.js', () => ({
  monitorAllClients: jest.fn(async () => {})
}));
jest.unstable_mockModule('../../..//lib/appointment-reminders.js', () => ({
  processReminderQueue: jest.fn(async () => ({ processed: 0, failed: 0 }))
}));
jest.unstable_mockModule('../../..//lib/follow-up-processor.js', () => ({
  processFollowUpQueue: jest.fn(async () => ({ processed: 0, failed: 0 }))
}));
jest.unstable_mockModule('../../..//lib/database-health.js', () => ({
  checkDatabaseHealth: jest.fn(async () => ({ status: 'healthy', consecutiveFailures: 0 }))
}));
jest.unstable_mockModule('../../..//lib/backup-monitoring.js', () => ({
  monitorBackups: jest.fn(async () => ({ status: 'healthy' }))
}));
jest.unstable_mockModule('../../..//lib/cost-monitoring.js', () => ({
  monitorAllBudgets: jest.fn(async () => ({ clientsChecked: 0, alertsFound: 0 }))
}));
jest.unstable_mockModule('../../..//lib/webhook-retry.js', () => ({
  processWebhookRetryQueue: jest.fn(async () => ({ processed: 0, success: 0, failed: 0 }))
}));
jest.unstable_mockModule('../../../lib/vapi-slot-lease.js', () => ({
  SQLITE_VAPI_SLOT_LEASES_DDL: '-- mocked',
  reapExpiredDbLeases: jest.fn(async () => 0),
  shouldUseDbSlotLeases: jest.fn(() => false)
}));
jest.unstable_mockModule('../../../lib/query-performance-tracker.js', () => ({
  appendQueryPerformanceDailySnapshot: jest.fn(async () => ({ ok: true }))
}));

describe('registerScheduledJobs', () => {
  let setIntervalSpy;

  beforeEach(() => {
    scheduled.length = 0;
    schedule.mockClear();
    setIntervalSpy = jest.spyOn(global, 'setInterval').mockImplementation(() => 123);
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    setIntervalSpy?.mockRestore();
    console.log.mockRestore();
    console.warn.mockRestore();
    console.error.mockRestore();
  });

  test('registers core schedules and wires dependency crons', async () => {
    const processCallQueue = jest.fn(async () => {});
    const processRetryQueue = jest.fn(async () => {});
    const queueNewLeadsForCalling = jest.fn(async () => {});
    const sendScheduledReminders = jest.fn(async () => {});

    const { registerScheduledJobs } = await import('../../../lib/scheduled-jobs.js');
    registerScheduledJobs({ processCallQueue, processRetryQueue, queueNewLeadsForCalling, sendScheduledReminders });

    expect(setIntervalSpy).toHaveBeenCalled();
    expect(setIntervalSpy.mock.calls[0][1]).toBe(5 * 60 * 1000);

    // allow dynamic-import .then() blocks to run
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    const exprs = scheduled.map((s) => s.expr);
    expect(exprs).toEqual(expect.arrayContaining([
      '12 * * * *',
      '1-59/5 * * * *',
      '2-59/5 * * * *',
      '3-59/5 * * * *',
      '7-59/10 * * * *',
      '23 5 * * *',
      '0-58/2 * * * *',
      '1-59/2 * * * *',
      '*/5 * * * *'
    ]));

    // Dependency-wired crons should call the passed deps.
    const evenMinutes = scheduled.find((s) => s.expr === '0-58/2 * * * *');
    expect(evenMinutes).toBeTruthy();
    await evenMinutes.fn();
    expect(processCallQueue).toHaveBeenCalled();

    const oddMinutes = scheduled.find((s) => s.expr === '1-59/2 * * * *');
    expect(oddMinutes).toBeTruthy();
    await oddMinutes.fn();
    expect(processRetryQueue).toHaveBeenCalled();

    const leadQueuer = scheduled.find((s) => s.expr === '*/5 * * * *');
    expect(leadQueuer).toBeTruthy();
    await leadQueuer.fn();
    expect(queueNewLeadsForCalling).toHaveBeenCalled();
  });
});

