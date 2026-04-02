// tests/unit/test-optimal-call-window.js

import { scheduleAtOptimalCallWindow } from '../../lib/optimal-call-window.js';
import { describe, test, assertTrue, printSummary, resetStats } from '../utils/test-helpers.js';

resetStats();

const tenant = {
  timezone: 'Europe/London',
  businessHours: { start: 9, end: 17, days: [1, 2, 3, 4, 5] }
};

describe('Optimal call window', () => {
  test('returns baseline when routing is empty', () => {
    const base = new Date('2026-04-02T10:00:00.000Z');
    const out = scheduleAtOptimalCallWindow(tenant, null, base, { fallbackTz: 'Europe/London' });
    assertTrue(out.getTime() === base.getTime(), 'unchanged');
  });

  test('returns baseline when no scored hours', () => {
    const routing = {
      recommendations: {
        bestHours: [{ hour: 14, label: '14:00', attempts: 3 }],
        bestWeekdays: []
      }
    };
    const base = new Date('2026-04-02T10:00:00.000Z');
    const out = scheduleAtOptimalCallWindow(tenant, routing, base, { fallbackTz: 'Europe/London' });
    assertTrue(out.getTime() === base.getTime(), 'no score means no nudge');
  });

  test('nudges to a later scored hour within cap', () => {
    const routing = {
      recommendations: {
        bestHours: [
          { hour: 11, label: '11:00', score: 90, attempts: 20 },
          { hour: 10, label: '10:00', score: 40, attempts: 20 }
        ],
        bestWeekdays: []
      }
    };
    const prevDelay = process.env.OPTIMAL_CALL_MAX_DELAY_MS;
    process.env.OPTIMAL_CALL_SCHEDULING = '1';
    process.env.OPTIMAL_CALL_MAX_DELAY_MS = String(4 * 60 * 60 * 1000);
    try {
      const base = new Date('2026-04-02T08:00:00.000Z');
      const out = scheduleAtOptimalCallWindow(tenant, routing, base, { fallbackTz: 'Europe/London' });
      assertTrue(out.getTime() > base.getTime(), 'scheduled later');
      assertTrue(out.getTime() <= base.getTime() + 5 * 60 * 60 * 1000, 'within slack');
    } finally {
      if (prevDelay === undefined) delete process.env.OPTIMAL_CALL_MAX_DELAY_MS;
      else process.env.OPTIMAL_CALL_MAX_DELAY_MS = prevDelay;
    }
  });
});

const exitCode = printSummary();
process.exit(exitCode);
