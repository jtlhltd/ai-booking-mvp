import { describe, expect, test, jest, beforeEach, afterEach } from '@jest/globals';

jest.unstable_mockModule('../../../lib/business-hours.js', () => ({
  getTenantTimezone: (_t, f) => f || 'UTC',
  getBusinessHoursConfig: () => ({ start: 9, end: 18, days: [0, 1, 2, 3, 4, 5, 6] }),
  isBusinessHoursForTenant: () => true,
  allowOutboundWeekendCalls: () => true,
  clampOutboundDialToAllowedWindow: (_t, d) => d
}));

const recordCallScheduleDecision = jest.fn(async () => {});

jest.unstable_mockModule('../../../db.js', () => ({
  recordCallScheduleDecision,
  getCallTimeBanditState: jest.fn(async () => ({}))
}));

describe('optimal-call-window', () => {
  const prevThompson = process.env.CALL_TIME_THOMPSON;
  const prevJitter = process.env.OPTIMAL_CALL_JITTER_MAX_SECONDS;
  const prevScheduling = process.env.OPTIMAL_CALL_SCHEDULING;

  beforeEach(() => {
    jest.resetModules();
    recordCallScheduleDecision.mockReset();
    process.env.OPTIMAL_CALL_JITTER_MAX_SECONDS = '0';
    delete process.env.OPTIMAL_CALL_SCHEDULING;
  });

  afterEach(() => {
    if (prevThompson === undefined) delete process.env.CALL_TIME_THOMPSON;
    else process.env.CALL_TIME_THOMPSON = prevThompson;
    if (prevJitter === undefined) delete process.env.OPTIMAL_CALL_JITTER_MAX_SECONDS;
    else process.env.OPTIMAL_CALL_JITTER_MAX_SECONDS = prevJitter;
    if (prevScheduling === undefined) delete process.env.OPTIMAL_CALL_SCHEDULING;
    else process.env.OPTIMAL_CALL_SCHEDULING = prevScheduling;
  });

  test('scheduleAtOptimalCallWindow with no tenant returns clamped baseline', async () => {
    const { scheduleAtOptimalCallWindow } = await import('../../../lib/optimal-call-window.js');
    const base = new Date('2026-01-05T10:15:00.000Z');
    const out = await scheduleAtOptimalCallWindow(null, null, base, { fallbackTz: 'UTC' });
    expect(out).toBeInstanceOf(Date);
    expect(out.getTime()).toBe(base.getTime());
  });

  test('scheduleAtOptimalCallWindow uses routing heuristic when Thompson disabled', async () => {
    process.env.CALL_TIME_THOMPSON = '0';
    const { scheduleAtOptimalCallWindow } = await import('../../../lib/optimal-call-window.js');
    const baseline = new Date('2026-01-05T10:30:00.000Z');
    const routing = {
      recommendations: {
        bestHours: [
          { hour: 15, score: 0.99 },
          { hour: 10, score: 0.1 }
        ],
        bestWeekdays: []
      }
    };
    const out = await scheduleAtOptimalCallWindow({}, routing, baseline, { fallbackTz: 'UTC' });
    expect(out.getUTCHours()).toBe(15);
    expect(out.getUTCMinutes()).toBe(0);
  });

  test('scheduleAtOptimalCallWindow falls back to baseline when routing empty', async () => {
    process.env.CALL_TIME_THOMPSON = '0';
    const { scheduleAtOptimalCallWindow } = await import('../../../lib/optimal-call-window.js');
    const baseline = new Date('2026-01-05T10:30:00.000Z');
    const out = await scheduleAtOptimalCallWindow({}, null, baseline, { fallbackTz: 'UTC' });
    expect(out.getTime()).toBe(baseline.getTime());
  });
});
